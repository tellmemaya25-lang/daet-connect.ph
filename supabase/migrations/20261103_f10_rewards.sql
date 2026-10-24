-- F10: Rewards Engine (shared CONNECT-Daet.ph table) + Team 8 point awards
--
-- rewards_ledger is a platform-wide table (owned by Team 11 per the team
-- guide). Team 8 creates it here because it did not exist yet; the contract is
-- documented in docs/SHARED_TABLES.md. Every award has a (source, ref_id) pair
-- that is UNIQUE, so retries, webhooks replays and double clicks never
-- double-award. Clients can only read their own rows; writes go through
-- rewards_add_points (service role / database triggers only).

-- ----------------------------------------------------------------
-- 1. Table
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rewards_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  points integer NOT NULL CHECK (points <> 0 AND points BETWEEN -100000 AND 100000),
  source text NOT NULL CHECK (source ~ '^[a-z0-9_]+\.[a-z0-9_]+$'),
  ref_id text NOT NULL CHECK (char_length(ref_id) BETWEEN 1 AND 200),
  description text CHECK (char_length(description) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rewards_ledger_source_ref_key UNIQUE (source, ref_id)
);
CREATE INDEX IF NOT EXISTS rewards_ledger_profile_idx ON public.rewards_ledger (profile_id, created_at DESC);

ALTER TABLE public.rewards_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rewards_ledger FROM anon, authenticated;
GRANT SELECT ON public.rewards_ledger TO authenticated;
CREATE POLICY rewards_ledger_read ON public.rewards_ledger
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR public.get_my_role() = 'admin');

CREATE OR REPLACE VIEW public.rewards_balances WITH (security_invoker = true) AS
  SELECT profile_id,
    sum(points)::int AS balance,
    coalesce(sum(points) FILTER (WHERE points > 0), 0)::int AS earned,
    count(*)::int AS entries
  FROM public.rewards_ledger
  GROUP BY profile_id;
GRANT SELECT ON public.rewards_balances TO authenticated;

-- ----------------------------------------------------------------
-- 2. Writer (idempotent). Returns true when the award is new.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rewards_add_points(
  p_profile_id uuid, p_points integer, p_source text, p_ref_id text, p_description text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  IF p_profile_id IS NULL OR p_points IS NULL OR p_points = 0 THEN
    RETURN false;
  END IF;
  INSERT INTO rewards_ledger (profile_id, points, source, ref_id, description)
  VALUES (p_profile_id, p_points, p_source, p_ref_id, p_description)
  ON CONFLICT (source, ref_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NOT NULL AND p_points > 0 THEN
    PERFORM tours_notify(p_profile_id, 'points_earned', format('+%s CONNECT-Daet points', p_points),
      coalesce(p_description, 'Thanks for exploring Daet!'), '/tours/me#rewards');
  END IF;
  RETURN v_id IS NOT NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.rewards_add_points(uuid, integer, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rewards_add_points(uuid, integer, text, text, text) TO service_role;

-- ----------------------------------------------------------------
-- 3. Team 8 awards, in the same transaction as the event
--    booking paid +50 (reversed on refund), checked in +30,
--    tour completed +20, review written +10, itinerary saved +5 (3/day)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_rewards_on_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_title text;
BEGIN
  SELECT title INTO v_title FROM tours_packages WHERE id = NEW.package_id;
  IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
    PERFORM rewards_add_points(NEW.user_id, 50, 'tours.booking_paid', NEW.id::text, format('Paid for %s', coalesce(v_title, 'your tour')));
  ELSIF NEW.payment_status = 'refunded' AND OLD.payment_status IS DISTINCT FROM 'refunded'
    AND EXISTS (SELECT 1 FROM rewards_ledger WHERE source = 'tours.booking_paid' AND ref_id = NEW.id::text) THEN
    PERFORM rewards_add_points(NEW.user_id, -50, 'tours.booking_paid_reversed', NEW.id::text, format('Refunded: %s', coalesce(v_title, 'tour')));
  END IF;
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    PERFORM rewards_add_points(NEW.user_id, 20, 'tours.tour_completed', NEW.id::text, format('Completed %s', coalesce(v_title, 'a tour')));
  END IF;
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.tours_rewards_on_checkin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user uuid;
BEGIN
  SELECT user_id INTO v_user FROM tours_bookings WHERE id = NEW.booking_id;
  -- Once per booking, however many participants are scanned.
  PERFORM rewards_add_points(v_user, 30, 'tours.checked_in', NEW.booking_id::text, 'Checked in with your guide');
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.tours_rewards_on_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM rewards_add_points(NEW.tourist_id, 10, 'tours.review_written', NEW.booking_id::text, 'Reviewed your tour');
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.tours_rewards_on_itinerary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today_awards int;
BEGIN
  -- Cap: three itinerary awards per Manila day, so saving copies doesn't farm points.
  SELECT count(*) INTO v_today_awards FROM rewards_ledger
  WHERE profile_id = NEW.tourist_id AND source = 'tours.itinerary_saved'
    AND (created_at AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date;
  IF v_today_awards < 3 THEN
    PERFORM rewards_add_points(NEW.tourist_id, 5, 'tours.itinerary_saved', NEW.id::text, 'Saved a trip plan');
  END IF;
  RETURN NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.tours_rewards_on_booking() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tours_rewards_on_checkin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tours_rewards_on_review() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tours_rewards_on_itinerary() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_tours_rewards_booking AFTER UPDATE OF payment_status, status ON public.tours_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tours_rewards_on_booking();
CREATE TRIGGER trg_tours_rewards_checkin AFTER INSERT ON public.tours_checkins
  FOR EACH ROW EXECUTE FUNCTION public.tours_rewards_on_checkin();
CREATE TRIGGER trg_tours_rewards_review AFTER INSERT ON public.tours_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tours_rewards_on_review();
CREATE TRIGGER trg_tours_rewards_itinerary AFTER INSERT ON public.tours_itineraries
  FOR EACH ROW EXECUTE FUNCTION public.tours_rewards_on_itinerary();

-- ----------------------------------------------------------------
-- 4. Backfill events that happened before this migration (no notifications)
-- ----------------------------------------------------------------
INSERT INTO public.rewards_ledger (profile_id, points, source, ref_id, description, created_at)
SELECT b.user_id, 50, 'tours.booking_paid', b.id::text, 'Paid for ' || coalesce(p.title, 'your tour'), b.updated_at
FROM tours_bookings b LEFT JOIN tours_packages p ON p.id = b.package_id
WHERE b.payment_status = 'paid'
ON CONFLICT (source, ref_id) DO NOTHING;
INSERT INTO public.rewards_ledger (profile_id, points, source, ref_id, description, created_at)
SELECT b.user_id, 20, 'tours.tour_completed', b.id::text, 'Completed ' || coalesce(p.title, 'a tour'), b.updated_at
FROM tours_bookings b LEFT JOIN tours_packages p ON p.id = b.package_id
WHERE b.status = 'completed'
ON CONFLICT (source, ref_id) DO NOTHING;
INSERT INTO public.rewards_ledger (profile_id, points, source, ref_id, description, created_at)
SELECT DISTINCT ON (c.booking_id) b.user_id, 30, 'tours.checked_in', c.booking_id::text, 'Checked in with your guide', c.scanned_at
FROM tours_checkins c JOIN tours_bookings b ON b.id = c.booking_id
ORDER BY c.booking_id, c.scanned_at
ON CONFLICT (source, ref_id) DO NOTHING;
INSERT INTO public.rewards_ledger (profile_id, points, source, ref_id, description, created_at)
SELECT r.tourist_id, 10, 'tours.review_written', r.booking_id::text, 'Reviewed your tour', r.created_at
FROM tours_reviews r
ON CONFLICT (source, ref_id) DO NOTHING;

-- ----------------------------------------------------------------
-- 5. Security fix found while documenting the shared tables:
--    users could UPDATE their own profiles.role (e.g. to 'admin') because the
--    RLS policy only checks id = auth.uid(). Browser updates are now limited
--    to display fields; role changes stay with the service role.
-- ----------------------------------------------------------------
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (full_name, avatar_url) ON public.profiles TO authenticated;
