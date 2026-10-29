-- ================================================================
-- Tourist <-> Tourism Office chat (F13 handoff)
--
-- The travel assistant hands general questions and complaints to the
-- Daet Tourism Office. This adds conversation kind 'tourist_office': one
-- per signed-in person, with every admin a member, mirroring
-- 'operator_admin' from 20261106_messaging_channels.sql.
--
-- Replacing the shape check is a drop-and-add, so applying this needs the
-- owner's approval (or paste it into the SQL editor).
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Kind and shape
-- ----------------------------------------------------------------
ALTER TABLE public.tours_conversations DROP CONSTRAINT IF EXISTS tours_conversations_kind_shape;
ALTER TABLE public.tours_conversations ADD CONSTRAINT tours_conversations_kind_shape CHECK (
  CASE kind
    WHEN 'booking' THEN booking_id IS NOT NULL
    WHEN 'guide_tourist' THEN booking_id IS NOT NULL
    WHEN 'operator_guide' THEN booking_id IS NULL AND operator_id IS NOT NULL AND guide_id IS NOT NULL
    WHEN 'operator_admin' THEN booking_id IS NULL AND operator_id IS NOT NULL AND guide_id IS NULL
    WHEN 'tourist_office' THEN booking_id IS NULL AND operator_id IS NULL AND guide_id IS NULL AND tourist_id IS NOT NULL
    ELSE false
  END);
CREATE UNIQUE INDEX IF NOT EXISTS tours_conversations_tourist_office_key
  ON public.tours_conversations (tourist_id) WHERE kind = 'tourist_office';

-- ----------------------------------------------------------------
-- 2. Membership: the person, plus every admin
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_is_conversation_member(p_conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM tours_conversations c
    WHERE c.id = p_conversation_id
      AND CASE c.kind
        WHEN 'booking' THEN public.tours_is_booking_tourist(c.booking_id)
          OR public.tours_is_booking_operator(c.booking_id)
          OR public.tours_is_booking_guide(c.booking_id)
        WHEN 'guide_tourist' THEN public.tours_is_booking_tourist(c.booking_id)
          OR public.tours_is_booking_guide(c.booking_id)
        WHEN 'operator_guide' THEN
          EXISTS (SELECT 1 FROM tours_operators o WHERE o.id = c.operator_id AND o.profile_id = (SELECT auth.uid()))
          OR EXISTS (SELECT 1 FROM tours_guides g WHERE g.id = c.guide_id AND g.profile_id = (SELECT auth.uid()))
        WHEN 'operator_admin' THEN
          EXISTS (SELECT 1 FROM tours_operators o WHERE o.id = c.operator_id AND o.profile_id = (SELECT auth.uid()))
          OR public.get_my_role() = 'admin'
        WHEN 'tourist_office' THEN c.tourist_id = (SELECT auth.uid()) OR public.get_my_role() = 'admin'
        ELSE false
      END
  );
$fn$;

-- ----------------------------------------------------------------
-- 3. Open (or reuse). Signed-in users open their own; an admin passes p_tourist_id.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_open_tourist_office_conversation(p_tourist_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tourist uuid;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to message the Tourism Office.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF public.get_my_role() = 'admin' AND p_tourist_id IS NOT NULL THEN
    SELECT id INTO v_tourist FROM profiles WHERE id = p_tourist_id;
  ELSE
    v_tourist := auth.uid();
  END IF;
  IF v_tourist IS NULL THEN
    RAISE EXCEPTION 'Account not found.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT id INTO v_id FROM tours_conversations WHERE kind = 'tourist_office' AND tourist_id = v_tourist;
  IF FOUND THEN
    RETURN v_id;
  END IF;
  INSERT INTO tours_conversations (kind, tourist_id)
  VALUES ('tourist_office', v_tourist)
  ON CONFLICT (tourist_id) WHERE kind = 'tourist_office' DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM tours_conversations WHERE kind = 'tourist_office' AND tourist_id = v_tourist;
  END IF;
  RETURN v_id;
END;
$fn$;

-- ----------------------------------------------------------------
-- 4. Notifications: the person's messages go to every admin, replies to them
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_notify_message_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  conv tours_conversations%ROWTYPE;
  c record;
  o record;
  v_link text := '/tours/messages/' || NEW.conversation_id;
  v_body text := COALESCE(left(NEW.message_text, 140), '📷 Photo');
  v_title text;
  v_recipients uuid[];
  v_recipient uuid;
BEGIN
  SELECT * INTO conv FROM tours_conversations WHERE id = NEW.conversation_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF conv.kind IN ('booking', 'guide_tourist') THEN
    SELECT * INTO c FROM public.tours_booking_context(conv.booking_id);
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
    IF conv.kind = 'booking' THEN
      v_recipients := ARRAY[c.tourist, c.operator_profile, c.guide_profile];
      v_title := 'New message · ' || c.title;
    ELSE
      v_recipients := ARRAY[c.tourist, c.guide_profile];
      v_title := CASE WHEN NEW.sender_id = c.guide_profile THEN 'Your guide wrote · ' ELSE 'Tourist wrote · ' END || c.title;
    END IF;
  ELSIF conv.kind = 'operator_guide' THEN
    SELECT op.profile_id AS operator_profile, op.business_name, g.profile_id AS guide_profile, p.full_name AS guide_name
      INTO o
      FROM tours_operators op, tours_guides g LEFT JOIN profiles p ON p.id = g.profile_id
     WHERE op.id = conv.operator_id AND g.id = conv.guide_id;
    v_recipients := ARRAY[o.operator_profile, o.guide_profile];
    v_title := CASE WHEN NEW.sender_id = o.operator_profile THEN 'Message from ' || o.business_name
                    ELSE 'Message from guide ' || COALESCE(o.guide_name, '') END;
  ELSIF conv.kind = 'operator_admin' THEN
    SELECT op.profile_id AS operator_profile, op.business_name INTO o FROM tours_operators op WHERE op.id = conv.operator_id;
    IF NEW.sender_id = o.operator_profile THEN
      v_recipients := ARRAY(SELECT id FROM profiles WHERE role::text = 'admin');
      v_title := 'Operator message · ' || o.business_name;
    ELSE
      v_recipients := ARRAY[o.operator_profile];
      v_title := 'Message from the Daet Tourism Office';
    END IF;
  ELSIF conv.kind = 'tourist_office' THEN
    IF NEW.sender_id = conv.tourist_id THEN
      v_recipients := ARRAY(SELECT id FROM profiles WHERE role::text = 'admin');
      v_title := 'Tourist message · ' || COALESCE((SELECT full_name FROM profiles WHERE id = conv.tourist_id), 'Tourist');
    ELSE
      v_recipients := ARRAY[conv.tourist_id];
      v_title := 'Message from the Daet Tourism Office';
    END IF;
  ELSE
    RETURN NULL;
  END IF;

  FOREACH v_recipient IN ARRAY v_recipients LOOP
    IF v_recipient IS NOT NULL AND v_recipient <> NEW.sender_id AND NOT EXISTS (
      SELECT 1 FROM tours_notifications
       WHERE profile_id = v_recipient AND type = 'message' AND link = v_link
         AND read_at IS NULL AND created_at > now() - interval '10 minutes'
    ) THEN
      PERFORM tours_notify(v_recipient, 'message', v_title, v_body, v_link);
    END IF;
  END LOOP;
  RETURN NULL;
END;
$fn$;

-- ----------------------------------------------------------------
-- 5. Inbox and thread header
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_chat_inbox()
RETURNS TABLE (
  conversation_id uuid, kind text, title text, subtitle text, booking_id uuid,
  last_message_at timestamptz, last_message text, last_sender_id uuid, unread integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT c.id, c.kind,
         CASE c.kind
           WHEN 'booking' THEN COALESCE(p.title, 'Tour booking')
           WHEN 'guide_tourist' THEN CASE WHEN b.user_id = (SELECT auth.uid()) THEN COALESCE(gp.full_name, 'Your guide') ELSE COALESCE(b.contact_name, 'Tourist') END
           WHEN 'operator_guide' THEN CASE WHEN o.profile_id = (SELECT auth.uid()) THEN COALESCE(gp.full_name, 'Guide') ELSE o.business_name END
           WHEN 'tourist_office' THEN CASE WHEN c.tourist_id = (SELECT auth.uid()) THEN 'Daet Tourism Office' ELSE COALESCE(tp.full_name, 'Tourist') END
           ELSE CASE WHEN o.profile_id = (SELECT auth.uid()) THEN 'Daet Tourism Office' ELSE o.business_name END
         END::text,
         CASE c.kind
           WHEN 'booking' THEN concat_ws(' · ', b.booking_reference, to_char(b.tour_date, 'Mon DD'), b.contact_name)
           WHEN 'guide_tourist' THEN concat_ws(' · ', CASE WHEN b.user_id = (SELECT auth.uid()) THEN 'Your guide' ELSE 'Tourist' END,
                                               p.title, b.booking_reference, to_char(b.tour_date, 'Mon DD'))
           WHEN 'operator_guide' THEN CASE WHEN o.profile_id = (SELECT auth.uid()) THEN 'Tour guide' ELSE 'Tour operator' END
           WHEN 'tourist_office' THEN CASE WHEN c.tourist_id = (SELECT auth.uid()) THEN 'Tourism Office help' ELSE 'Tourist · help request' END
           ELSE CASE WHEN o.profile_id = (SELECT auth.uid()) THEN 'Tourism Office support' ELSE 'Operator · ' || o.accreditation_status::text END
         END::text,
         c.booking_id, c.last_message_at, lm.message_text, lm.sender_id,
         (SELECT count(*)::int FROM tours_messages m
           WHERE m.conversation_id = c.id AND m.sender_id <> (SELECT auth.uid())
             AND m.created_at > COALESCE(r.last_read_at, '-infinity'::timestamptz))
  FROM tours_conversations c
  LEFT JOIN tours_bookings b ON b.id = c.booking_id
  LEFT JOIN tours_packages p ON p.id = b.package_id
  LEFT JOIN tours_operators o ON o.id = COALESCE(p.operator_id, c.operator_id)
  LEFT JOIN tours_guides g ON g.id = CASE WHEN c.booking_id IS NOT NULL THEN b.assigned_guide_id ELSE c.guide_id END
  LEFT JOIN profiles gp ON gp.id = g.profile_id
  LEFT JOIN profiles tp ON tp.id = c.tourist_id AND c.kind = 'tourist_office'
  LEFT JOIN tours_conversation_reads r ON r.conversation_id = c.id AND r.profile_id = (SELECT auth.uid())
  LEFT JOIN LATERAL (
    SELECT m.message_text, m.sender_id FROM tours_messages m
    WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1
  ) lm ON true
  WHERE public.tours_is_conversation_member(c.id)
  ORDER BY c.last_message_at DESC;
$fn$;

CREATE OR REPLACE FUNCTION public.tours_conversation_header(p_conversation_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r record;
  v_member boolean := public.tours_is_conversation_member(p_conversation_id);
BEGIN
  IF NOT v_member AND public.get_my_role() <> 'admin' THEN
    RETURN NULL;
  END IF;
  SELECT c.id, c.kind, c.booking_id, b.booking_reference::text AS reference, b.status::text AS status, b.tour_date,
         COALESCE(b.contact_name::text, tp.full_name::text) AS contact_name, COALESCE(b.user_id, c.tourist_id) AS user_id, p.title::text AS title,
         o.id AS operator_id, o.profile_id AS operator_profile, o.business_name::text AS business_name,
         g.id AS guide_id, g.profile_id AS guide_profile, gp.full_name::text AS guide_name
    INTO r
    FROM tours_conversations c
    LEFT JOIN tours_bookings b ON b.id = c.booking_id
    LEFT JOIN tours_packages p ON p.id = b.package_id
    LEFT JOIN tours_operators o ON o.id = COALESCE(p.operator_id, c.operator_id)
    LEFT JOIN tours_guides g ON g.id = CASE WHEN c.booking_id IS NOT NULL THEN b.assigned_guide_id ELSE c.guide_id END
    LEFT JOIN profiles gp ON gp.id = g.profile_id
    LEFT JOIN profiles tp ON tp.id = c.tourist_id AND c.kind = 'tourist_office'
   WHERE c.id = p_conversation_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'id', r.id, 'kind', r.kind, 'is_member', v_member,
    'booking_id', r.booking_id, 'booking_reference', r.reference, 'booking_status', r.status,
    'tour_date', r.tour_date, 'package_title', r.title,
    'tourist_id', CASE WHEN r.kind IN ('booking', 'guide_tourist', 'tourist_office') THEN r.user_id END,
    'tourist_name', r.contact_name,
    'operator_id', r.operator_id,
    'operator_profile_id', CASE WHEN r.kind NOT IN ('guide_tourist', 'tourist_office') THEN r.operator_profile END,
    'operator_name', r.business_name,
    'guide_id', r.guide_id,
    'guide_profile_id', CASE WHEN r.kind NOT IN ('operator_admin', 'tourist_office') THEN r.guide_profile END,
    'guide_name', r.guide_name);
END;
$fn$;

-- ----------------------------------------------------------------
-- 6. Privileges
-- ----------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.tours_open_tourist_office_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_open_tourist_office_conversation(uuid) TO authenticated;
