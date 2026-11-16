-- Friend chats: two friends can message each other, and sharing a trip plan
-- with a friend also posts it in their chat.
--
-- A 'friends' conversation stores the pair in order: tourist_id is the smaller
-- profile id and friend_id the larger, so each pair has one chat.

ALTER TABLE public.tours_conversations ADD COLUMN IF NOT EXISTS friend_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.tours_conversations DROP CONSTRAINT IF EXISTS tours_conversations_kind_shape;
ALTER TABLE public.tours_conversations ADD CONSTRAINT tours_conversations_kind_shape CHECK (
  CASE kind
    WHEN 'booking' THEN booking_id IS NOT NULL
    WHEN 'guide_tourist' THEN booking_id IS NOT NULL
    WHEN 'operator_guide' THEN booking_id IS NULL AND operator_id IS NOT NULL AND guide_id IS NOT NULL
    WHEN 'operator_admin' THEN booking_id IS NULL AND operator_id IS NOT NULL AND guide_id IS NULL
    WHEN 'tourist_office' THEN booking_id IS NULL AND operator_id IS NULL AND guide_id IS NULL AND tourist_id IS NOT NULL
    WHEN 'friends' THEN booking_id IS NULL AND operator_id IS NULL AND guide_id IS NULL
                        AND tourist_id IS NOT NULL AND friend_id IS NOT NULL AND tourist_id < friend_id
    ELSE false
  END
);
CREATE UNIQUE INDEX IF NOT EXISTS tours_conversations_friends_key ON public.tours_conversations (tourist_id, friend_id) WHERE kind = 'friends';
CREATE INDEX IF NOT EXISTS idx_conversations_friend ON public.tours_conversations (friend_id) WHERE friend_id IS NOT NULL;

-- Membership ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tours_is_conversation_member(p_conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
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
        WHEN 'friends' THEN (SELECT auth.uid()) IN (c.tourist_id, c.friend_id)
        ELSE false
      END
  );
$$;

-- Opening a chat with a friend ---------------------------------------------------------

/** The chat between the caller and a friend, created on first use. Only friends can chat. */
CREATE OR REPLACE FUNCTION public.tours_open_friend_conversation(p_friend uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_me uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_id uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Sign in to message your friends.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_friend IS NULL OR p_friend = v_me OR NOT tours_are_friends(v_me, p_friend) THEN
    RAISE EXCEPTION 'You can only message your friends.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_a := LEAST(v_me, p_friend);
  v_b := GREATEST(v_me, p_friend);
  SELECT id INTO v_id FROM tours_conversations WHERE kind = 'friends' AND tourist_id = v_a AND friend_id = v_b;
  IF FOUND THEN
    RETURN v_id;
  END IF;
  INSERT INTO tours_conversations (kind, tourist_id, friend_id) VALUES ('friends', v_a, v_b)
  ON CONFLICT (tourist_id, friend_id) WHERE kind = 'friends' DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM tours_conversations WHERE kind = 'friends' AND tourist_id = v_a AND friend_id = v_b;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_open_friend_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_open_friend_conversation(uuid) TO authenticated;

-- Inbox ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tours_chat_inbox()
RETURNS TABLE(conversation_id uuid, kind text, title text, subtitle text, booking_id uuid, last_message_at timestamptz, last_message text, last_sender_id uuid, unread integer, other_profile_id uuid, other_avatar_url text, other_last_seen timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT q.id, q.kind, q.title, q.subtitle, q.booking_id, q.last_message_at, q.message_text, q.sender_id, q.unread,
         q.other_id, cp.avatar_url::text, pr.last_seen_at
  FROM (
    SELECT c.id, c.kind,
           CASE c.kind
             WHEN 'booking' THEN CASE WHEN b.user_id = (SELECT auth.uid()) THEN COALESCE(p.title, 'Tour booking') ELSE COALESCE(b.contact_name, 'Tourist') END
             WHEN 'guide_tourist' THEN CASE WHEN b.user_id = (SELECT auth.uid()) THEN COALESCE(gp.full_name, 'Your guide') ELSE COALESCE(b.contact_name, 'Tourist') END
             WHEN 'operator_guide' THEN CASE WHEN o.profile_id = (SELECT auth.uid()) THEN COALESCE(gp.full_name, 'Guide') ELSE o.business_name END
             WHEN 'tourist_office' THEN CASE WHEN c.tourist_id = (SELECT auth.uid()) THEN 'Daet Tourism Office' ELSE COALESCE(tp.full_name, 'Tourist') END
             WHEN 'friends' THEN COALESCE(fp.full_name, 'Friend')
             ELSE CASE WHEN o.profile_id = (SELECT auth.uid()) THEN 'Daet Tourism Office' ELSE o.business_name END
           END::text AS title,
           CASE c.kind
             WHEN 'booking' THEN CASE WHEN b.user_id = (SELECT auth.uid())
                                      THEN concat_ws(' · ', b.booking_reference, to_char(b.tour_date, 'Mon DD'), b.contact_name)
                                      ELSE concat_ws(' · ', p.title, b.booking_reference, to_char(b.tour_date, 'Mon DD')) END
             WHEN 'guide_tourist' THEN concat_ws(' · ', CASE WHEN b.user_id = (SELECT auth.uid()) THEN 'Your guide' ELSE 'Tourist' END,
                                                 p.title, b.booking_reference, to_char(b.tour_date, 'Mon DD'))
             WHEN 'operator_guide' THEN CASE WHEN o.profile_id = (SELECT auth.uid()) THEN 'Tour guide' ELSE 'Tour operator' END
             WHEN 'tourist_office' THEN CASE WHEN c.tourist_id = (SELECT auth.uid()) THEN 'Tourism Office help' ELSE 'Tourist · help request' END
             WHEN 'friends' THEN 'Friend'
             ELSE CASE WHEN o.profile_id = (SELECT auth.uid()) THEN 'Tourism Office support' ELSE 'Operator · ' || o.accreditation_status::text END
           END::text AS subtitle,
           c.booking_id, c.last_message_at, lm.message_text, lm.sender_id,
           (SELECT count(*)::int FROM tours_messages m
             WHERE m.conversation_id = c.id AND m.sender_id <> (SELECT auth.uid())
               AND m.created_at > COALESCE(r.last_read_at, '-infinity'::timestamptz)) AS unread,
           CASE c.kind
             WHEN 'booking' THEN CASE WHEN b.user_id = (SELECT auth.uid()) THEN o.profile_id ELSE b.user_id END
             WHEN 'guide_tourist' THEN CASE WHEN b.user_id = (SELECT auth.uid()) THEN g.profile_id ELSE b.user_id END
             WHEN 'operator_guide' THEN CASE WHEN o.profile_id = (SELECT auth.uid()) THEN g.profile_id ELSE o.profile_id END
             WHEN 'tourist_office' THEN CASE WHEN c.tourist_id = (SELECT auth.uid()) THEN NULL ELSE c.tourist_id END
             WHEN 'friends' THEN fp.id
             ELSE CASE WHEN o.profile_id = (SELECT auth.uid()) THEN NULL ELSE o.profile_id END
           END AS other_id
    FROM tours_conversations c
    LEFT JOIN tours_bookings b ON b.id = c.booking_id
    LEFT JOIN tours_packages p ON p.id = b.package_id
    LEFT JOIN tours_operators o ON o.id = COALESCE(p.operator_id, c.operator_id)
    LEFT JOIN tours_guides g ON g.id = CASE WHEN c.booking_id IS NOT NULL THEN b.assigned_guide_id ELSE c.guide_id END
    LEFT JOIN profiles gp ON gp.id = g.profile_id
    LEFT JOIN profiles tp ON tp.id = c.tourist_id AND c.kind = 'tourist_office'
    LEFT JOIN profiles fp ON c.kind = 'friends'
                         AND fp.id = CASE WHEN c.tourist_id = (SELECT auth.uid()) THEN c.friend_id ELSE c.tourist_id END
    LEFT JOIN tours_conversation_reads r ON r.conversation_id = c.id AND r.profile_id = (SELECT auth.uid())
    LEFT JOIN LATERAL (
      SELECT m.message_text, m.sender_id FROM tours_messages m
      WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1
    ) lm ON true
    WHERE public.tours_is_conversation_member(c.id)
  ) q
  LEFT JOIN profiles cp ON cp.id = q.other_id
  LEFT JOIN tours_presence pr ON pr.profile_id = q.other_id
  ORDER BY q.last_message_at DESC;
$$;

-- Thread header: friend chats name the other friend ---------------------------------------

CREATE OR REPLACE FUNCTION public.tours_conversation_header(p_conversation_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r record;
  v_member boolean := public.tours_is_conversation_member(p_conversation_id);
  v_friend uuid;
BEGIN
  IF NOT v_member AND public.get_my_role() <> 'admin' THEN
    RETURN NULL;
  END IF;
  SELECT c.id, c.kind, c.booking_id, c.tourist_id AS pair_a, c.friend_id AS pair_b,
         b.booking_reference::text AS reference, b.status::text AS status, b.tour_date,
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
  IF r.kind = 'friends' THEN
    v_friend := CASE WHEN r.pair_a = auth.uid() THEN r.pair_b ELSE r.pair_a END;
    RETURN jsonb_build_object(
      'id', r.id, 'kind', r.kind, 'is_member', v_member,
      'booking_id', NULL, 'booking_reference', NULL, 'booking_status', NULL, 'tour_date', NULL, 'package_title', NULL,
      'tourist_id', NULL, 'tourist_name', NULL, 'operator_id', NULL, 'operator_profile_id', NULL, 'operator_name', NULL,
      'guide_id', NULL, 'guide_profile_id', NULL, 'guide_name', NULL,
      'friend_profile_id', v_friend,
      'friend_name', COALESCE((SELECT full_name FROM profiles WHERE id = v_friend), 'Friend'));
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
$$;

-- Message notifications: a friend chat notifies the other friend ---------------------------

CREATE OR REPLACE FUNCTION public.tours_notify_message_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
  ELSIF conv.kind = 'friends' THEN
    v_recipients := ARRAY[conv.tourist_id, conv.friend_id];
    v_title := 'Message from ' || COALESCE((SELECT full_name FROM profiles WHERE id = NEW.sender_id), 'a friend');
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
$$;

-- Sharing a plan also messages each newly added friend --------------------------------------

CREATE OR REPLACE FUNCTION public.tours_share_itinerary_with(p_itinerary uuid, p_friend_ids uuid[])
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := tours_require_user();
  v_ids uuid[] := ARRAY(SELECT DISTINCT unnest(COALESCE(p_friend_ids, '{}')));
  v_title text;
  v_name text;
  v_new uuid;
  v_chat uuid;
BEGIN
  SELECT title INTO v_title FROM tours_itineraries WHERE id = p_itinerary AND tourist_id = v_me;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the plan''s owner can share it.' USING ERRCODE = '42501';
  END IF;
  IF cardinality(v_ids) > 200 THEN
    RAISE EXCEPTION 'Choose up to 200 friends.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_ids) x WHERE NOT tours_are_friends(v_me, x)) THEN
    RAISE EXCEPTION 'You can only share with your friends.' USING ERRCODE = '22023';
  END IF;

  DELETE FROM tours_itinerary_shares WHERE itinerary_id = p_itinerary AND NOT (friend_id = ANY (v_ids));
  SELECT COALESCE(full_name, 'A friend') INTO v_name FROM profiles WHERE id = v_me;
  FOR v_new IN
    INSERT INTO tours_itinerary_shares (itinerary_id, friend_id)
    SELECT p_itinerary, x FROM unnest(v_ids) x
    ON CONFLICT DO NOTHING
    RETURNING friend_id
  LOOP
    PERFORM tours_notify(v_new, 'itinerary_shared', v_name || ' shared a trip plan with you', COALESCE(v_title, 'Trip plan'), '/tours/friends/plans/' || p_itinerary);
    -- The plan also lands in their chat. A message that can't be sent (for
    -- example the per-minute message limit) never undoes the share.
    BEGIN
      v_chat := tours_open_friend_conversation(v_new);
      INSERT INTO tours_messages (conversation_id, sender_id, message_text)
      VALUES (v_chat, v_me, '🗺️ I shared my trip plan "' || COALESCE(v_title, 'Trip plan') || '" with you: /tours/friends/plans/' || p_itinerary);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
  RETURN cardinality(v_ids);
END;
$$;
