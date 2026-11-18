-- Guide assignment by package hours, without double booking.
--
-- 20261209 made the schedule rule hour-based: a guide can take two short tours
-- on one day when their package hours (meeting_time + duration) don't overlap.
-- But the older unique index from 20261202 still allowed only one active
-- booking per guide per day, so the second, non-overlapping tour was refused
-- with "already has a tour on that day".
--
-- 1. Drop that per-day index; the hour-based rule is the one that applies.
-- 2. The index was also the guard against two assignments racing past the
--    rule's EXISTS check at once. Replace it with a lock per guide and date
--    taken in the schedule guard, so concurrent assignments run one at a time
--    and the second one sees the first.

DROP INDEX IF EXISTS public.tours_bookings_one_tour_per_guide_day;

CREATE OR REPLACE FUNCTION public.tours_bookings_guide_schedule_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason text;
BEGIN
  IF NEW.assigned_guide_id IS NULL OR NEW.status NOT IN ('pending', 'confirmed') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.assigned_guide_id IS NOT DISTINCT FROM OLD.assigned_guide_id
     AND NEW.tour_date IS NOT DISTINCT FROM OLD.tour_date
     AND OLD.status IN ('pending', 'confirmed') THEN
    RETURN NEW;
  END IF;
  -- One assignment per guide and day at a time; held until the transaction ends.
  PERFORM pg_advisory_xact_lock(hashtextextended('guide_schedule:' || NEW.assigned_guide_id::text || NEW.tour_date::text, 0));
  v_reason := tours_guide_busy_reason_for(NEW.assigned_guide_id, NEW.tour_date, NEW.package_id, NEW.id);
  IF v_reason IS NOT NULL THEN
    RAISE EXCEPTION 'guide_schedule:%', v_reason
      USING ERRCODE = 'P0001',
            HINT = 'The guide must be approved, available for the tour''s hours, and not on another tour at that time.';
  END IF;
  RETURN NEW;
END;
$$;
