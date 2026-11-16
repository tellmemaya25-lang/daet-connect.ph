-- No double booking (owner's list, item 4).
--
-- 1. A tourist can hold only one active (pending or confirmed) booking for the
--    same package on the same date. A second tap of "Book", or a second tab,
--    used to create two bookings. The trigger gives a readable message; the
--    unique index is the guard that also holds under concurrent inserts.
-- 2. A guide can be on only one active booking per day. The schedule guard
--    already checked this with a plain EXISTS, which two concurrent
--    assignments could both pass; the unique index closes that race.
-- 3. Contact numbers on new bookings are digits only (item 2). NOT VALID so
--    the two older rows with spaces or "+" are left as they are.
--
-- Production had no duplicates of either kind when this was written, so both
-- indexes build without touching data.

CREATE OR REPLACE FUNCTION public.tours_bookings_no_duplicate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Serialise bookings by the same person for the same trip and day.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text || NEW.package_id::text || NEW.tour_date::text, 0));
  IF EXISTS (
    SELECT 1 FROM tours_bookings b
     WHERE b.user_id = NEW.user_id
       AND b.package_id = NEW.package_id
       AND b.tour_date = NEW.tour_date
       AND b.status IN ('pending', 'confirmed')
  ) THEN
    RAISE EXCEPTION 'You already have a booking for this tour on this date. Open My bookings to change the number of guests.'
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tours_bookings_no_duplicate() FROM PUBLIC, anon, authenticated;

-- Named so it runs after the rate limit (a_) and before the pricing trigger (before_insert).
DROP TRIGGER IF EXISTS trg_tours_bookings_b_no_duplicate ON public.tours_bookings;
CREATE TRIGGER trg_tours_bookings_b_no_duplicate
  BEFORE INSERT ON public.tours_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tours_bookings_no_duplicate();

CREATE UNIQUE INDEX IF NOT EXISTS tours_bookings_one_active_per_tourist
  ON public.tours_bookings (user_id, package_id, tour_date)
  WHERE status IN ('pending', 'confirmed');

CREATE UNIQUE INDEX IF NOT EXISTS tours_bookings_one_tour_per_guide_day
  ON public.tours_bookings (assigned_guide_id, tour_date)
  WHERE assigned_guide_id IS NOT NULL AND status IN ('pending', 'confirmed');

ALTER TABLE public.tours_bookings DROP CONSTRAINT IF EXISTS tours_bookings_contact_phone_digits;
ALTER TABLE public.tours_bookings
  ADD CONSTRAINT tours_bookings_contact_phone_digits
  CHECK (contact_phone ~ '^[0-9]{10,13}$') NOT VALID;
