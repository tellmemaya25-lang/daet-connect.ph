-- ================================================================
-- Messaging channels
--
-- F4 gave each booking one group chat (tourist, operator, assigned guide).
-- This adds three private channels on the same tables:
--   guide_tourist   one per booking: the tourist and the assigned guide
--   operator_guide  one per (operator, guide) pair
--   operator_admin  one per operator: the operator and the Tourism Office
--                   (every admin is a member)
-- Membership is still worked out on every check, so reassigning a guide
-- moves the guide-tourist chat with them. Conversations are opened only
-- through the tours_open_*_conversation() RPCs; message validation, rate
-- limits, read state, attachments and Realtime are unchanged from F4.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Conversation kind
-- ----------------------------------------------------------------
ALTER TABLE public.tours_conversations ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'booking';
ALTER TABLE public.tours_conversations ALTER COLUMN tourist_id DROP NOT NULL;
ALTER TABLE public.tours_conversations ADD CONSTRAINT tours_conversations_kind_shape CHECK (
  CASE kind
    WHEN 'booking' THEN booking_id IS NOT NULL
    WHEN 'guide_tourist' THEN booking_id IS NOT NULL
    WHEN 'operator_guide' THEN booking_id IS NULL AND operator_id IS NOT NULL AND guide_id IS NOT NULL
    WHEN 'operator_admin' THEN booking_id IS NULL AND operator_id IS NOT NULL AND guide_id IS NULL
    ELSE false
  END);

-- One conversation per booking per kind, per operator-guide pair, per operator.
CREATE UNIQUE INDEX IF NOT EXISTS tours_conversations_booking_kind_key
  ON public.tours_conversations (booking_id) WHERE kind = 'booking';
CREATE UNIQUE INDEX IF NOT EXISTS tours_conversations_guide_tourist_key
  ON public.tours_conversations (booking_id) WHERE kind = 'guide_tourist';
CREATE UNIQUE INDEX IF NOT EXISTS tours_conversations_operator_guide_key
  ON public.tours_conversations (operator_id, guide_id) WHERE kind = 'operator_guide';
CREATE UNIQUE INDEX IF NOT EXISTS tours_conversations_operator_admin_key
  ON public.tours_conversations (operator_id) WHERE kind = 'operator_admin';
-- F4's index allowed one conversation per booking of any kind.
DROP INDEX IF EXISTS public.tours_conversations_booking_key;

-- ----------------------------------------------------------------
-- 2. Membership by kind
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
        ELSE false
      END
  );
$fn$;

-- ----------------------------------------------------------------
-- 3. Open (or reuse) a conversation
-- ----------------------------------------------------------------
-- F4's booking chat, now matched on its own kind.
CREATE OR REPLACE FUNCTION public.tours_open_booking_conversation(p_booking_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  b tours_bookings%ROWTYPE;
  v_operator uuid;
  v_id uuid;
BEGIN
  IF NOT (public.tours_is_booking_tourist(p_booking_id)
          OR public.tours_is_booking_operator(p_booking_id)
          OR public.tours_is_booking_guide(p_booking_id)) THEN
    RAISE EXCEPTION 'Booking not found.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT id INTO v_id FROM tours_conversations WHERE booking_id = p_booking_id AND kind = 'booking';
  IF FOUND THEN
    RETURN v_id;
  END IF;

  SELECT * INTO b FROM tours_bookings WHERE id = p_booking_id;
  IF b.status IN ('cancelled', 'rejected') THEN
    RAISE EXCEPTION 'Messaging is closed for this booking.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT operator_id INTO v_operator FROM tours_packages WHERE id = b.package_id;

  INSERT INTO tours_conversations (kind, tourist_id, operator_id, guide_id, booking_id)
  VALUES ('booking', b.user_id, v_operator, b.assigned_guide_id, b.id)
  ON CONFLICT (booking_id) WHERE kind = 'booking' DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM tours_conversations WHERE booking_id = p_booking_id AND kind = 'booking';
  END IF;
  RETURN v_id;
END;
$fn$;

-- Private chat between a booking's tourist and its assigned guide.
CREATE OR REPLACE FUNCTION public.tours_open_guide_tourist_conversation(p_booking_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  b tours_bookings%ROWTYPE;
  v_operator uuid;
  v_id uuid;
BEGIN
  IF NOT (public.tours_is_booking_tourist(p_booking_id) OR public.tours_is_booking_guide(p_booking_id)) THEN
    RAISE EXCEPTION 'Booking not found.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO b FROM tours_bookings WHERE id = p_booking_id;
  IF b.assigned_guide_id IS NULL THEN
    RAISE EXCEPTION 'No guide is assigned to this booking yet.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT id INTO v_id FROM tours_conversations WHERE booking_id = p_booking_id AND kind = 'guide_tourist';
  IF FOUND THEN
    RETURN v_id;
  END IF;
  IF b.status IN ('cancelled', 'rejected') THEN
    RAISE EXCEPTION 'Messaging is closed for this booking.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT operator_id INTO v_operator FROM tours_packages WHERE id = b.package_id;

  INSERT INTO tours_conversations (kind, tourist_id, operator_id, guide_id, booking_id)
  VALUES ('guide_tourist', b.user_id, v_operator, b.assigned_guide_id, b.id)
  ON CONFLICT (booking_id) WHERE kind = 'guide_tourist' DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM tours_conversations WHERE booking_id = p_booking_id AND kind = 'guide_tourist';
  END IF;
  RETURN v_id;
END;
$fn$;

-- Operator and guide. An approved operator passes p_guide_id; an approved
-- guide passes p_operator_id. Both sides must be accredited.
CREATE OR REPLACE FUNCTION public.tours_open_operator_guide_conversation(p_guide_id uuid DEFAULT NULL, p_operator_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_operator uuid;
  v_guide uuid;
  v_id uuid;
BEGIN
  SELECT id INTO v_operator FROM tours_operators
   WHERE profile_id = auth.uid() AND accreditation_status::text = 'approved' LIMIT 1;
  IF v_operator IS NOT NULL THEN
    SELECT id INTO v_guide FROM tours_guides WHERE id = p_guide_id AND accreditation_status::text = 'approved';
  ELSE
    SELECT id INTO v_guide FROM tours_guides
     WHERE profile_id = auth.uid() AND accreditation_status::text = 'approved' LIMIT 1;
    IF v_guide IS NOT NULL THEN
      SELECT id INTO v_operator FROM tours_operators WHERE id = p_operator_id AND accreditation_status::text = 'approved';
    END IF;
  END IF;
  IF v_operator IS NULL OR v_guide IS NULL THEN
    RAISE EXCEPTION 'Only accredited operators and guides can message each other.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT id INTO v_id FROM tours_conversations
   WHERE kind = 'operator_guide' AND operator_id = v_operator AND guide_id = v_guide;
  IF FOUND THEN
    RETURN v_id;
  END IF;
  INSERT INTO tours_conversations (kind, operator_id, guide_id)
  VALUES ('operator_guide', v_operator, v_guide)
  ON CONFLICT (operator_id, guide_id) WHERE kind = 'operator_guide' DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM tours_conversations
     WHERE kind = 'operator_guide' AND operator_id = v_operator AND guide_id = v_guide;
  END IF;
  RETURN v_id;
END;
$fn$;

-- Operator and the Tourism Office. The operator calls it without arguments
-- (pending applicants too); an admin passes p_operator_id.
CREATE OR REPLACE FUNCTION public.tours_open_operator_admin_conversation(p_operator_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_operator uuid;
  v_id uuid;
BEGIN
  IF public.get_my_role() = 'admin' THEN
    SELECT id INTO v_operator FROM tours_operators WHERE id = p_operator_id;
  ELSE
    SELECT id INTO v_operator FROM tours_operators WHERE profile_id = auth.uid() LIMIT 1;
  END IF;
  IF v_operator IS NULL THEN
    RAISE EXCEPTION 'Operator not found.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT id INTO v_id FROM tours_conversations WHERE kind = 'operator_admin' AND operator_id = v_operator;
  IF FOUND THEN
    RETURN v_id;
  END IF;
  INSERT INTO tours_conversations (kind, operator_id)
  VALUES ('operator_admin', v_operator)
  ON CONFLICT (operator_id) WHERE kind = 'operator_admin' DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM tours_conversations WHERE kind = 'operator_admin' AND operator_id = v_operator;
  END IF;
  RETURN v_id;
END;
$fn$;

-- ----------------------------------------------------------------
-- 4. Notifications per kind (replaces F5's booking-only version)
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
-- 5. Inbox and thread header for every kind
-- ----------------------------------------------------------------
-- Security definer so names of the other side resolve; rows are limited to
-- the caller's own conversations.
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
           ELSE CASE WHEN o.profile_id = (SELECT auth.uid()) THEN 'Daet Tourism Office' ELSE o.business_name END
         END::text,
         CASE c.kind
           WHEN 'booking' THEN concat_ws(' · ', b.booking_reference, to_char(b.tour_date, 'Mon DD'), b.contact_name)
           WHEN 'guide_tourist' THEN concat_ws(' · ', CASE WHEN b.user_id = (SELECT auth.uid()) THEN 'Your guide' ELSE 'Tourist' END,
                                               p.title, b.booking_reference, to_char(b.tour_date, 'Mon DD'))
           WHEN 'operator_guide' THEN CASE WHEN o.profile_id = (SELECT auth.uid()) THEN 'Tour guide' ELSE 'Tour operator' END
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
  LEFT JOIN tours_conversation_reads r ON r.conversation_id = c.id AND r.profile_id = (SELECT auth.uid())
  LEFT JOIN LATERAL (
    SELECT m.message_text, m.sender_id FROM tours_messages m
    WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1
  ) lm ON true
  WHERE public.tours_is_conversation_member(c.id)
  ORDER BY c.last_message_at DESC;
$fn$;

-- Who is in a thread, for its header and bubble labels. Members and admins only.
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
         b.contact_name::text AS contact_name, b.user_id, p.title::text AS title,
         o.id AS operator_id, o.profile_id AS operator_profile, o.business_name::text AS business_name,
         g.id AS guide_id, g.profile_id AS guide_profile, gp.full_name::text AS guide_name
    INTO r
    FROM tours_conversations c
    LEFT JOIN tours_bookings b ON b.id = c.booking_id
    LEFT JOIN tours_packages p ON p.id = b.package_id
    LEFT JOIN tours_operators o ON o.id = COALESCE(p.operator_id, c.operator_id)
    LEFT JOIN tours_guides g ON g.id = CASE WHEN c.booking_id IS NOT NULL THEN b.assigned_guide_id ELSE c.guide_id END
    LEFT JOIN profiles gp ON gp.id = g.profile_id
   WHERE c.id = p_conversation_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'id', r.id, 'kind', r.kind, 'is_member', v_member,
    'booking_id', r.booking_id, 'booking_reference', r.reference, 'booking_status', r.status,
    'tour_date', r.tour_date, 'package_title', r.title,
    'tourist_id', CASE WHEN r.kind IN ('booking', 'guide_tourist') THEN r.user_id END,
    'tourist_name', r.contact_name,
    'operator_id', r.operator_id,
    'operator_profile_id', CASE WHEN r.kind <> 'guide_tourist' THEN r.operator_profile END,
    'operator_name', r.business_name,
    'guide_id', r.guide_id,
    'guide_profile_id', CASE WHEN r.kind <> 'operator_admin' THEN r.guide_profile END,
    'guide_name', r.guide_name);
END;
$fn$;

-- ----------------------------------------------------------------
-- 6. Function privileges
-- ----------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.tours_open_guide_tourist_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_open_guide_tourist_conversation(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_open_operator_guide_conversation(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_open_operator_guide_conversation(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_open_operator_admin_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_open_operator_admin_conversation(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_chat_inbox() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_chat_inbox() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_conversation_header(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_conversation_header(uuid) TO authenticated;
