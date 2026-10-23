-- F12: Hardening from the Supabase security and performance advisors.
-- Verified with a rolled-back dry run: no policy changes who can see what
-- (105 role × table visibility checks identical before and after).

-- 1. Security: fixed search_path on the only function missing it.
ALTER FUNCTION public.tours_peso(numeric) SET search_path = public;

-- 2. Performance (auth_rls_initplan): evaluate auth.uid()/jwt()/role() once
--    per query instead of once per row by wrapping them in a sub-select.
--    Rewrites every public policy that still calls them directly; the
--    deparsed expressions are otherwise unchanged.
DO $rewrite$
DECLARE
  r record;
  stmt text;
  pat constant text := '(?<!SELECT )auth\.(uid|jwt|role)\(\)';
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND (coalesce(qual, '') || coalesce(with_check, '')) ~ pat
  LOOP
    stmt := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF r.qual IS NOT NULL THEN
      stmt := stmt || ' USING (' || regexp_replace(r.qual, pat, '(SELECT auth.\1())', 'g') || ')';
    END IF;
    IF r.with_check IS NOT NULL THEN
      stmt := stmt || ' WITH CHECK (' || regexp_replace(r.with_check, pat, '(SELECT auth.\1())', 'g') || ')';
    END IF;
    EXECUTE stmt;
  END LOOP;
END
$rewrite$;

-- 3. Performance (unindexed_foreign_keys): cover every single-column FK.
CREATE INDEX IF NOT EXISTS tours_operators_reviewed_by_idx ON public.tours_operators (reviewed_by);
CREATE INDEX IF NOT EXISTS tours_guides_reviewed_by_idx ON public.tours_guides (reviewed_by);
CREATE INDEX IF NOT EXISTS tours_payment_proofs_verified_by_idx ON public.tours_payment_proofs (verified_by);
CREATE INDEX IF NOT EXISTS tours_payment_proofs_submitted_by_idx ON public.tours_payment_proofs (submitted_by);
CREATE INDEX IF NOT EXISTS tours_payment_proofs_payment_id_idx ON public.tours_payment_proofs (payment_id);
CREATE INDEX IF NOT EXISTS tours_cancellations_requested_by_idx ON public.tours_cancellations (requested_by);
CREATE INDEX IF NOT EXISTS tours_cancellations_resolved_by_idx ON public.tours_cancellations (resolved_by);
CREATE INDEX IF NOT EXISTS tours_reviews_tourist_id_idx ON public.tours_reviews (tourist_id);
CREATE INDEX IF NOT EXISTS tours_messages_sender_id_idx ON public.tours_messages (sender_id);
CREATE INDEX IF NOT EXISTS tours_itinerary_items_linked_package_id_idx ON public.tours_itinerary_items (linked_package_id);
CREATE INDEX IF NOT EXISTS tours_itinerary_items_attraction_id_idx ON public.tours_itinerary_items (attraction_id);
CREATE INDEX IF NOT EXISTS tours_bookings_price_variant_id_idx ON public.tours_bookings (price_variant_id);
CREATE INDEX IF NOT EXISTS tours_payments_recorded_by_idx ON public.tours_payments (recorded_by);
CREATE INDEX IF NOT EXISTS tours_events_created_by_idx ON public.tours_events (created_by);
CREATE INDEX IF NOT EXISTS tours_conversation_reads_profile_id_idx ON public.tours_conversation_reads (profile_id);
CREATE INDEX IF NOT EXISTS tours_merchandise_created_by_idx ON public.tours_merchandise (created_by);
CREATE INDEX IF NOT EXISTS tours_payment_events_booking_id_idx ON public.tours_payment_events (booking_id);
CREATE INDEX IF NOT EXISTS tours_checkins_participant_id_idx ON public.tours_checkins (participant_id);
CREATE INDEX IF NOT EXISTS tours_checkins_guide_id_idx ON public.tours_checkins (guide_id);

-- Not changed here (see docs/SECURITY_REVIEW.md):
-- * duplicate_index on tours_itinerary_items / tours_reviews — drop one of each pair
--   (idx_tours_itinerary_items_itinerary, idx_tours_reviews_operator) from the dashboard.
-- * multiple_permissive_policies — merging overlapping policies is a larger refactor
--   with little gain at this data size.

-- 4. Rate limit bookings. Pending bookings hold seats, so one account could
--    otherwise book out a date without paying. Fires before the existing
--    booking checks (triggers run in name order).
CREATE OR REPLACE FUNCTION public.tours_bookings_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_recent int;
  v_pending int;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT count(*) FILTER (WHERE created_at > now() - interval '10 minutes'),
         count(*) FILTER (WHERE status = 'pending')
    INTO v_recent, v_pending
  FROM tours_bookings WHERE user_id = NEW.user_id;
  IF v_recent >= 5 THEN
    RAISE EXCEPTION 'You have made several bookings in a few minutes. Please wait a little before booking again.';
  END IF;
  IF v_pending >= 10 THEN
    RAISE EXCEPTION 'You have 10 bookings waiting for operator confirmation. Cancel one or wait for a reply before booking more.';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.tours_bookings_rate_limit() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_tours_bookings_a_rate_limit BEFORE INSERT ON public.tours_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tours_bookings_rate_limit();
