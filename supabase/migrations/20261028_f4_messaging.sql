-- ================================================================
-- F4: Booking messaging (real-time)
--
-- One conversation per booking. Members are worked out from the booking
-- every time (its tourist, the package's operator, the assigned guide), so
-- reassigning a guide moves chat access with it. Admins can read.
-- Conversations are opened only through tours_open_booking_conversation();
-- messages are validated (1-1000 chars or an attachment, 20/min per sender)
-- by a trigger. Read state is per person (tours_conversation_reads) because
-- a thread has up to three people. tours_messages is already in the
-- supabase_realtime publication; Realtime applies the SELECT policy below.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Membership
-- ----------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS tours_conversations_booking_key
  ON public.tours_conversations (booking_id) WHERE booking_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tours_is_conversation_member(p_conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM tours_conversations c
    WHERE c.id = p_conversation_id AND c.booking_id IS NOT NULL
      AND (public.tours_is_booking_tourist(c.booking_id)
           OR public.tours_is_booking_operator(c.booking_id)
           OR public.tours_is_booking_guide(c.booking_id))
  );
$fn$;

-- ----------------------------------------------------------------
-- 2. Privileges and policies (rewritten in place)
-- ----------------------------------------------------------------
REVOKE ALL ON public.tours_conversations FROM anon, authenticated;
REVOKE ALL ON public.tours_messages FROM anon, authenticated;
GRANT SELECT ON public.tours_conversations TO authenticated;
GRANT SELECT ON public.tours_messages TO authenticated;
GRANT INSERT (conversation_id, sender_id, message_text, attachment_url) ON public.tours_messages TO authenticated;

ALTER POLICY "Tourist creates conversations" ON public.tours_conversations TO authenticated WITH CHECK (false);
ALTER POLICY "Tourist creates conversations" ON public.tours_conversations RENAME TO tours_conversations_insert_disabled;

ALTER POLICY "Participants view own conversations" ON public.tours_conversations TO authenticated
  USING (public.tours_is_conversation_member(id));
ALTER POLICY "Admin views all conversations" ON public.tours_conversations TO authenticated
  USING (get_my_role() = 'admin');

ALTER POLICY "Participants view messages in own conversations" ON public.tours_messages TO authenticated
  USING (public.tours_is_conversation_member(conversation_id));
ALTER POLICY "Admin views all messages" ON public.tours_messages TO authenticated
  USING (get_my_role() = 'admin');
ALTER POLICY "Participants send messages in own conversations" ON public.tours_messages TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.tours_is_conversation_member(conversation_id));

-- ----------------------------------------------------------------
-- 3. Message validation, rate limit, conversation timestamp
-- ----------------------------------------------------------------
ALTER TABLE public.tours_messages ALTER COLUMN sender_id SET DEFAULT auth.uid();

CREATE OR REPLACE FUNCTION public.tours_messages_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_recent int;
BEGIN
  NEW.message_text := NULLIF(btrim(COALESCE(NEW.message_text, '')), '');
  NEW.attachment_url := NULLIF(btrim(COALESCE(NEW.attachment_url, '')), '');
  NEW.is_read := false;
  NEW.created_at := now();

  IF NEW.message_text IS NULL AND NEW.attachment_url IS NULL THEN
    RAISE EXCEPTION 'Write a message or attach a photo.' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(NEW.message_text) > 1000 THEN
    RAISE EXCEPTION 'Messages can be at most 1000 characters.' USING ERRCODE = 'check_violation';
  END IF;
  -- Attachments are storage paths inside this conversation's folder.
  IF NEW.attachment_url IS NOT NULL
     AND NEW.attachment_url !~ ('^' || NEW.conversation_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') THEN
    RAISE EXCEPTION 'Attachment is not valid.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_recent FROM tours_messages
   WHERE sender_id = NEW.sender_id AND created_at > now() - interval '1 minute';
  IF v_recent >= 20 THEN
    RAISE EXCEPTION 'You are sending messages too quickly. Please wait a moment.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE TRIGGER trg_tours_messages_before_insert
BEFORE INSERT ON public.tours_messages
FOR EACH ROW EXECUTE FUNCTION public.tours_messages_before_insert();

CREATE OR REPLACE FUNCTION public.tours_messages_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  UPDATE tours_conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  INSERT INTO tours_conversation_reads (conversation_id, profile_id, last_read_at)
  VALUES (NEW.conversation_id, NEW.sender_id, NEW.created_at)
  ON CONFLICT (conversation_id, profile_id) DO UPDATE SET last_read_at = GREATEST(tours_conversation_reads.last_read_at, EXCLUDED.last_read_at);
  RETURN NULL;
END;
$fn$;

-- ----------------------------------------------------------------
-- 4. Per-person read state
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tours_conversation_reads (
  conversation_id uuid NOT NULL REFERENCES public.tours_conversations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, profile_id)
);
ALTER TABLE public.tours_conversation_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tours_conversation_reads FROM anon, authenticated;
GRANT SELECT ON public.tours_conversation_reads TO authenticated;
CREATE POLICY tours_conversation_reads_own ON public.tours_conversation_reads FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE OR REPLACE TRIGGER trg_tours_messages_after_insert
AFTER INSERT ON public.tours_messages
FOR EACH ROW EXECUTE FUNCTION public.tours_messages_after_insert();

CREATE OR REPLACE FUNCTION public.tours_mark_conversation_read(p_conversation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.tours_is_conversation_member(p_conversation_id) THEN
    RAISE EXCEPTION 'Conversation not found.' USING ERRCODE = 'no_data_found';
  END IF;
  INSERT INTO tours_conversation_reads (conversation_id, profile_id, last_read_at)
  VALUES (p_conversation_id, auth.uid(), now())
  ON CONFLICT (conversation_id, profile_id) DO UPDATE SET last_read_at = now();
END;
$fn$;

-- ----------------------------------------------------------------
-- 5. Open (or reuse) the conversation for a booking
-- ----------------------------------------------------------------
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

  SELECT id INTO v_id FROM tours_conversations WHERE booking_id = p_booking_id;
  IF FOUND THEN
    RETURN v_id;
  END IF;

  SELECT * INTO b FROM tours_bookings WHERE id = p_booking_id;
  IF b.status IN ('cancelled', 'rejected') THEN
    RAISE EXCEPTION 'Messaging is closed for this booking.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT operator_id INTO v_operator FROM tours_packages WHERE id = b.package_id;

  INSERT INTO tours_conversations (tourist_id, operator_id, guide_id, booking_id)
  VALUES (b.user_id, v_operator, b.assigned_guide_id, b.id)
  ON CONFLICT (booking_id) WHERE booking_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM tours_conversations WHERE booking_id = p_booking_id;
  END IF;
  RETURN v_id;
END;
$fn$;

-- ----------------------------------------------------------------
-- 6. Inbox (runs as the caller, so RLS decides what is listed)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_inbox()
RETURNS TABLE (
  conversation_id uuid, booking_id uuid, booking_reference text, package_title text, tour_date date,
  tourist_name text, last_message_at timestamptz, last_message text, last_sender_id uuid, unread integer
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $fn$
  SELECT c.id, c.booking_id, b.booking_reference::text, p.title::text, b.tour_date, b.contact_name::text,
         c.last_message_at, lm.message_text, lm.sender_id,
         (SELECT count(*)::int FROM tours_messages m
           WHERE m.conversation_id = c.id AND m.sender_id <> auth.uid()
             AND m.created_at > COALESCE(r.last_read_at, '-infinity'::timestamptz))
  FROM tours_conversations c
  JOIN tours_bookings b ON b.id = c.booking_id
  LEFT JOIN tours_packages p ON p.id = b.package_id
  LEFT JOIN tours_conversation_reads r ON r.conversation_id = c.id AND r.profile_id = auth.uid()
  LEFT JOIN LATERAL (
    SELECT m.message_text, m.sender_id FROM tours_messages m
    WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1
  ) lm ON true
  WHERE public.tours_is_conversation_member(c.id)
  ORDER BY c.last_message_at DESC;
$fn$;

-- ----------------------------------------------------------------
-- 7. Photo attachments: private bucket, <conversation_id>/<uuid>.<ext>
-- ----------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('tours-message-attachments', 'tours-message-attachments', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY tours_message_attachments_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'tours-message-attachments'
  AND public.tours_is_conversation_member(((storage.foldername(name))[1])::uuid)
);
CREATE POLICY tours_message_attachments_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'tours-message-attachments'
  AND (public.tours_is_conversation_member(((storage.foldername(name))[1])::uuid) OR get_my_role() = 'admin')
);

-- ----------------------------------------------------------------
-- 8. Function privileges
-- ----------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.tours_is_conversation_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_is_conversation_member(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_messages_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_messages_after_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_mark_conversation_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_mark_conversation_read(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_open_booking_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_open_booking_conversation(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_inbox() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_inbox() TO authenticated;
