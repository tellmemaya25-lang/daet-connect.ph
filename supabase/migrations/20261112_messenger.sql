-- ================================================================
-- Messenger-style chats (messenger + AI guide, phases 4 and 5)
--
-- 1. Seen: members can read when the others last read the chat.
-- 2. Private Realtime channels per conversation for typing dots, the online
--    dot and "seen" pings: only members may join or send on them.
-- 3. Reply-to: a message can quote an earlier one in the same chat.
-- 4. Reactions: one reaction per person per message, from a fixed set.
-- ================================================================

-- 1. Seen ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_conversation_read_marks(p_conversation_id uuid)
RETURNS TABLE (profile_id uuid, last_read_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT r.profile_id, r.last_read_at
  FROM tours_conversation_reads r
  WHERE r.conversation_id = p_conversation_id
    AND r.profile_id <> auth.uid()
    AND tours_is_conversation_member(p_conversation_id);
$fn$;
REVOKE EXECUTE ON FUNCTION public.tours_conversation_read_marks(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_conversation_read_marks(uuid) TO authenticated;

-- 2. Private Realtime channels: topic "conversation:<uuid>" -----------
CREATE OR REPLACE FUNCTION public.tours_realtime_conversation_allowed(p_topic text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT p_topic ~ '^conversation:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND tours_is_conversation_member(substring(p_topic FROM 14)::uuid);
$fn$;
REVOKE EXECUTE ON FUNCTION public.tours_realtime_conversation_allowed(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_realtime_conversation_allowed(text) TO authenticated;

DROP POLICY IF EXISTS tours_conversation_channel_read ON realtime.messages;
CREATE POLICY tours_conversation_channel_read ON realtime.messages FOR SELECT TO authenticated
  USING (extension IN ('broadcast', 'presence') AND public.tours_realtime_conversation_allowed(realtime.topic()));
DROP POLICY IF EXISTS tours_conversation_channel_write ON realtime.messages;
CREATE POLICY tours_conversation_channel_write ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (extension IN ('broadcast', 'presence') AND public.tours_realtime_conversation_allowed(realtime.topic()));

-- 3. Reply-to -----------------------------------------------------
ALTER TABLE public.tours_messages ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.tours_messages(id) ON DELETE SET NULL;
GRANT INSERT (reply_to_id) ON public.tours_messages TO authenticated;

CREATE OR REPLACE FUNCTION public.tours_messages_check_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.reply_to_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM tours_messages m WHERE m.id = NEW.reply_to_id AND m.conversation_id = NEW.conversation_id
  ) THEN
    RAISE EXCEPTION 'You can only reply to a message in the same chat.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.tours_messages_check_reply() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_tours_messages_check_reply ON public.tours_messages;
CREATE TRIGGER trg_tours_messages_check_reply BEFORE INSERT ON public.tours_messages
FOR EACH ROW EXECUTE FUNCTION public.tours_messages_check_reply();

-- 4. Reactions ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tours_message_reactions (
  message_id uuid NOT NULL REFERENCES public.tours_messages(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.tours_conversations(id) ON DELETE CASCADE,
  reaction text NOT NULL CHECK (reaction IN ('like', 'love', 'haha', 'wow', 'sad', 'thanks')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_tours_message_reactions_conversation ON public.tours_message_reactions (conversation_id);
CREATE INDEX IF NOT EXISTS idx_tours_message_reactions_profile ON public.tours_message_reactions (profile_id);

-- The conversation is copied from the message, never trusted from the client.
CREATE OR REPLACE FUNCTION public.tours_message_reactions_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  SELECT m.conversation_id INTO NEW.conversation_id FROM tours_messages m WHERE m.id = NEW.message_id;
  IF NEW.conversation_id IS NULL THEN
    RAISE EXCEPTION 'Message not found.' USING ERRCODE = '23503';
  END IF;
  NEW.profile_id := auth.uid();
  RETURN NEW;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.tours_message_reactions_fill() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_tours_message_reactions_fill ON public.tours_message_reactions;
CREATE TRIGGER trg_tours_message_reactions_fill BEFORE INSERT OR UPDATE ON public.tours_message_reactions
FOR EACH ROW EXECUTE FUNCTION public.tours_message_reactions_fill();

ALTER TABLE public.tours_message_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tours_message_reactions FROM anon, authenticated;
GRANT SELECT, DELETE ON public.tours_message_reactions TO authenticated;
GRANT INSERT (message_id, conversation_id, reaction), UPDATE (reaction) ON public.tours_message_reactions TO authenticated;

CREATE POLICY tours_message_reactions_member_read ON public.tours_message_reactions FOR SELECT TO authenticated
  USING (tours_is_conversation_member(conversation_id));
CREATE POLICY tours_message_reactions_own_insert ON public.tours_message_reactions FOR INSERT TO authenticated
  WITH CHECK (profile_id = (SELECT auth.uid()) AND tours_is_conversation_member(conversation_id));
CREATE POLICY tours_message_reactions_own_update ON public.tours_message_reactions FOR UPDATE TO authenticated
  USING (profile_id = (SELECT auth.uid())) WITH CHECK (profile_id = (SELECT auth.uid()) AND tours_is_conversation_member(conversation_id));
CREATE POLICY tours_message_reactions_own_delete ON public.tours_message_reactions FOR DELETE TO authenticated
  USING (profile_id = (SELECT auth.uid()));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tours_message_reactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tours_message_reactions;
  END IF;
END $$;
