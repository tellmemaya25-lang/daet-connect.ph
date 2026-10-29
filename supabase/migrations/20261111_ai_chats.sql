-- ================================================================
-- Daet AI assistant chat history (messenger + AI guide, phase 3)
--
-- Signed-in travellers keep their conversation with the assistant, like any
-- other chat. Each person reads, adds and deletes only their own messages;
-- nobody else (operators, guides, admins) can read them. Visitors' chats stay
-- in their browser only. Locations are never stored here.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.tours_ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
  cards jsonb CHECK (cards IS NULL OR jsonb_typeof(cards) = 'array'),
  mode text CHECK (mode IN ('ai', 'basic')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tours_ai_messages_owner ON public.tours_ai_messages (profile_id, created_at DESC);

ALTER TABLE public.tours_ai_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tours_ai_messages FROM anon, authenticated;
GRANT SELECT, DELETE ON public.tours_ai_messages TO authenticated;
GRANT INSERT (role, content, cards, mode) ON public.tours_ai_messages TO authenticated;

CREATE POLICY tours_ai_messages_own_read ON public.tours_ai_messages FOR SELECT TO authenticated
  USING (profile_id = (SELECT auth.uid()));
CREATE POLICY tours_ai_messages_own_insert ON public.tours_ai_messages FOR INSERT TO authenticated
  WITH CHECK (profile_id = (SELECT auth.uid()));
CREATE POLICY tours_ai_messages_own_delete ON public.tours_ai_messages FOR DELETE TO authenticated
  USING (profile_id = (SELECT auth.uid()));
