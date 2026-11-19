-- Tours by time allotment: a tourist cannot be booked twice at once, and a guide
-- or a multi-day trip occupies every day it actually takes.
--
-- 1. A package's time allotment is its window (meeting_time for duration_value
--    hours; the whole day when the catalogue can't tell), the same rule the
--    guide schedule already used (20261209).
-- 2. A multi-day tour occupies consecutive dates, not one. "3 days 2 nights"
--    booked for 21 Nov holds 21, 22 and 23 Nov. Day 1 starts at the meeting
--    time; every following day is held whole, because a package has no return
--    time to say when the group gets back.
-- 3. A tourist may not hold two active bookings that overlap in time on a day.
--    The old rule only refused the same package on the same date, so a 1-hour
--    tour at 09:00 could be booked inside an 8-hour tour already paid for.
--    Overlap is tested on windows widened by a transfer buffer, because a
--    tourist needs time to get from one tour to the next.
-- 4. Guides follow the same span: busy on every day of a multi-day trip, and
--    available for the tour's hours on each of those days.
--
-- Windows are minutes from midnight, [start, end), as in 20261209. Ranges are
-- int4range/daterange so overlap is `&&` and the database does the arithmetic.
--
-- Applied by hand in the Supabase SQL editor.

-- ---------------------------------------------------------------- 1. Allotment

/** How many calendar days a booking takes. Day tours and hour tours take one. */
CREATE OR REPLACE FUNCTION public.tours_package_span_days(p_package uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT CASE WHEN p.duration_type = 'days' THEN GREATEST(1, COALESCE(p.duration_value, 1)) ELSE 1 END
      FROM tours_packages p WHERE p.id = p_package
  ), 1);
$$;

/** Minutes from midnight a package starts on its first day. No meeting time = 00:00. */
CREATE OR REPLACE FUNCTION public.tours_package_start_minute(p_package uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT (extract(epoch FROM p.meeting_time) / 60)::int FROM tours_packages p
     WHERE p.id = p_package AND p.meeting_time IS NOT NULL
  ), 0);
$$;

/**
 * The minutes a booking takes on one of its days (1 = the tour date).
 * Single-day tours use the package window. A multi-day trip starts at its
 * meeting time on day 1 and holds every later day whole.
 */
CREATE OR REPLACE FUNCTION public.tours_booking_window(p_package uuid, p_day integer)
RETURNS int4range
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN public.tours_package_span_days(p_package) <= 1 THEN public.tours_package_window(p_package)
    WHEN COALESCE(p_day, 1) <= 1 THEN int4range(public.tours_package_start_minute(p_package), 1440)
    ELSE int4range(0, 1440)
  END;
$$;

/** The dates a booking occupies: [tour_date, tour_date + span). */
CREATE OR REPLACE FUNCTION public.tours_occupied_dates(p_package uuid, p_date date)
RETURNS daterange
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT daterange(p_date, p_date + public.tours_package_span_days(p_package), '[)');
$$;

/** Minutes a tourist needs between tours. Mirrored by TRANSFER_BUFFER_MIN in src/lib/tours/booking-windows.ts. */
CREATE OR REPLACE FUNCTION public.tours_transfer_buffer()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 45; $$;

/** A window widened by the buffer on both sides, kept inside the day. */
CREATE OR REPLACE FUNCTION public.tours_window_with_buffer(p_window int4range, p_buffer integer)
RETURNS int4range
LANGUAGE sql IMMUTABLE
AS $$
  SELECT int4range(GREATEST(0, lower(p_window) - GREATEST(0, p_buffer)),
                   LEAST(1440, upper(p_window) + GREATEST(0, p_buffer)));
$$;

/** "9:00 AM – 10:00 AM", "6:00 AM – midnight", or "all day". */
CREATE OR REPLACE FUNCTION public.tours_window_text(p_window int4range)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(p_window) <= 0 AND upper(p_window) >= 1440 THEN 'all day'
    WHEN upper(p_window) >= 1440 THEN
      to_char(time '00:00' + make_interval(mins => lower(p_window)), 'FMHH12:MI AM') || ' – midnight'
    ELSE
      to_char(time '00:00' + make_interval(mins => lower(p_window)), 'FMHH12:MI AM')
      || ' – ' ||
      to_char(time '00:00' + make_interval(mins => upper(p_window)), 'FMHH12:MI AM')
  END;
$$;

-- ------------------------------------------------- 2. The tourist's own calendar

/**
 * Why this tourist cannot take this tour on this date, or NULL when they can.
 * The message is written for the person booking it.
 *
 * Both directions matter. An existing multi-day trip may already cover the
 * chosen date, and a new multi-day trip may run into a tour booked later in the
 * week — so the overlap is tested on the first day both bookings are running,
 * whichever booking that day belongs to.
 */
CREATE OR REPLACE FUNCTION public.tours_tourist_busy_reason_for(
  p_user uuid, p_date date, p_package uuid, p_exclude_booking uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT 'This tour overlaps your booking for ' || p.title
      || ' (' || public.tours_window_text(
           public.tours_booking_window(x.package_id, (x.shared - x.tour_date) + 1))
      || ') on ' || to_char(x.shared, 'DD Mon') || '.'
      || ' Pick another date, or cancel that booking first.'
    FROM (
      SELECT b.*, LEAST(
               GREATEST(b.tour_date, p_date),
               LEAST(b.tour_date + public.tours_package_span_days(b.package_id) - 1,
                     p_date + public.tours_package_span_days(p_package) - 1)
             ) AS shared
        FROM tours_bookings b
       WHERE b.user_id = p_user
         AND b.status IN ('pending', 'confirmed')
         AND (p_exclude_booking IS NULL OR b.id <> p_exclude_booking)
         -- The two spans share at least one day.
         AND b.tour_date <= p_date + public.tours_package_span_days(p_package) - 1
         AND p_date <= b.tour_date + public.tours_package_span_days(b.package_id) - 1
    ) x
    JOIN tours_packages p ON p.id = x.package_id
   -- Only the existing booking is widened, so the rule is "at least one buffer
   -- between the two tours". Widening both would quietly demand two.
   WHERE public.tours_window_with_buffer(
           public.tours_booking_window(x.package_id, (x.shared - x.tour_date) + 1),
           public.tours_transfer_buffer())
         &&
         public.tours_booking_window(p_package, (x.shared - p_date) + 1)
   ORDER BY x.tour_date, x.id
   LIMIT 1;
$$;

-- --------------------------------------------------------- 3. Enforcement

CREATE OR REPLACE FUNCTION public.tours_bookings_tourist_time_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reason text;
BEGIN
  IF NEW.user_id IS NULL OR NEW.tour_date IS NULL OR NEW.package_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Serialise everything this tourist does on this day, so two tabs booking two
  -- different tours at once cannot both pass the check below.
  PERFORM pg_advisory_xact_lock(hashtextextended('tourist_day:' || NEW.user_id::text || NEW.tour_date::text, 0));

  v_reason := public.tours_tourist_busy_reason_for(NEW.user_id, NEW.tour_date, NEW.package_id, NEW.id);
  IF v_reason IS NOT NULL THEN
    RAISE EXCEPTION '%', v_reason USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tours_bookings_tourist_time_guard() FROM PUBLIC, anon, authenticated;

-- Sorts after b_no_duplicate (so "this tour, this date" keeps its own message)
-- and before before_insert (which prices the booking).
DROP TRIGGER IF EXISTS trg_tours_bookings_b_zz_tourist_time ON public.tours_bookings;
CREATE TRIGGER trg_tours_bookings_b_zz_tourist_time
  BEFORE INSERT ON public.tours_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tours_bookings_tourist_time_guard();

-- ------------------------------------------------- 4. Guides follow the span

CREATE OR REPLACE FUNCTION public.tours_guide_busy_reason_for(p_guide uuid, p_date date, p_package uuid, p_exclude_booking uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM tours_guides g WHERE g.id = p_guide AND g.accreditation_status = 'approved') THEN 'not_approved'

    -- Available for the tour's hours on every day it takes, not just the first.
    WHEN EXISTS (
      SELECT 1 FROM generate_series(0, public.tours_package_span_days(p_package) - 1) AS s(d)
       WHERE NOT EXISTS (
         SELECT 1 FROM tours_guide_availability a
          WHERE a.guide_id = p_guide AND a.available_date = p_date + s.d AND a.is_available
            AND public.tours_availability_window(a.start_time, a.end_time)
                @> public.tours_booking_window(p_package, s.d + 1)
       )
    ) THEN 'not_available'

    -- Already on a tour that occupies one of the new tour's days.
    WHEN EXISTS (
      SELECT 1 FROM tours_bookings b
       WHERE b.assigned_guide_id = p_guide
         AND b.status IN ('pending', 'confirmed')
         AND (p_exclude_booking IS NULL OR b.id <> p_exclude_booking)
         AND public.tours_occupied_dates(b.package_id, b.tour_date) @> p_date
         AND public.tours_booking_window(b.package_id, (p_date - b.tour_date) + 1)
             && public.tours_booking_window(p_package, 1)
    ) THEN 'already_booked'

    -- A new multi-day trip may also run into tours the guide already has later.
    WHEN EXISTS (
      SELECT 1 FROM tours_bookings b
       WHERE b.assigned_guide_id = p_guide
         AND b.status IN ('pending', 'confirmed')
         AND (p_exclude_booking IS NULL OR b.id <> p_exclude_booking)
         AND public.tours_occupied_dates(p_package, p_date) @> b.tour_date
         AND public.tours_booking_window(b.package_id, 1)
             && public.tours_booking_window(p_package, (b.tour_date - p_date) + 1)
    ) THEN 'already_booked'

    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.tours_guide_busy_reason_for(uuid, date, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_guide_busy_reason_for(uuid, date, uuid, uuid) TO authenticated;

/** The fair pick (20261211) now also skips guides who are out on a trip that spans this day. */
CREATE OR REPLACE FUNCTION public.tours_pick_guide(p_package_id uuid, p_date date, p_booking_id uuid, p_rejected uuid[])
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT g.id
    FROM tours_guides g
    JOIN tours_packages p ON p.id = p_package_id
    LEFT JOIN tours_package_guides pg ON pg.package_id = p.id AND pg.guide_id = g.id AND pg.is_active
    LEFT JOIN tours_guide_ratings r ON r.guide_id = g.id
   WHERE g.accreditation_status = 'approved'
     AND tours_guide_works_for(g.id, p.operator_id)
     AND NOT (g.id = ANY (COALESCE(p_rejected, '{}')))
     AND tours_guide_busy_reason_for(g.id, p_date, p_package_id, p_booking_id) IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM tours_bookings o
        WHERE o.proposed_guide_id = g.id
          AND o.guide_proposal_status = 'proposed' AND o.status IN ('pending', 'confirmed')
          AND (p_booking_id IS NULL OR o.id <> p_booking_id)
          AND public.tours_occupied_dates(o.package_id, o.tour_date) @> p_date
          AND public.tours_booking_window(o.package_id, (p_date - o.tour_date) + 1)
              && public.tours_booking_window(p_package_id, 1)
     )
     AND NOT EXISTS (
       SELECT 1 FROM tours_bookings o
        WHERE o.proposed_guide_id = g.id
          AND o.guide_proposal_status = 'proposed' AND o.status IN ('pending', 'confirmed')
          AND (p_booking_id IS NULL OR o.id <> p_booking_id)
          AND public.tours_occupied_dates(p_package_id, p_date) @> o.tour_date
          AND public.tours_booking_window(o.package_id, 1)
              && public.tours_booking_window(p_package_id, (o.tour_date - p_date) + 1)
     )
   ORDER BY
     pg.guide_id IS NULL,
     (SELECT count(*) FROM tours_bookings w JOIN tours_packages wp ON wp.id = w.package_id
       WHERE w.assigned_guide_id = g.id AND wp.operator_id = p.operator_id
         AND w.status IN ('pending', 'confirmed', 'completed')
         AND w.tour_date >= p_date - 30 AND w.tour_date <= p_date),
     COALESCE(pg.priority, 1000),
     CASE WHEN COALESCE(r.review_count, 0) > 0 THEN r.average_rating END DESC NULLS LAST,
     g.created_at, g.id
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.tours_pick_guide(uuid, date, uuid, uuid[]) FROM PUBLIC, anon, authenticated;

/** A guide can't narrow or drop hours that a booked tour needs — on any day that tour takes. */
CREATE OR REPLACE FUNCTION public.tours_guide_availability_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guide uuid := COALESCE(OLD.guide_id, NEW.guide_id);
  v_date date := COALESCE(OLD.available_date, NEW.available_date);
BEGIN
  IF EXISTS (
    SELECT 1 FROM tours_bookings b
     WHERE b.assigned_guide_id = v_guide
       AND b.status IN ('pending', 'confirmed')
       AND public.tours_occupied_dates(b.package_id, b.tour_date) @> v_date
       AND (TG_OP = 'DELETE' OR NOT NEW.is_available
            OR NOT public.tours_availability_window(NEW.start_time, NEW.end_time)
                   @> public.tours_booking_window(b.package_id, (v_date - b.tour_date) + 1))
  ) THEN
    RAISE EXCEPTION 'guide_schedule:booked_that_day'
      USING ERRCODE = 'P0001', HINT = 'Ask the operator for a swap before changing hours you are booked for.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ---------------------------------------------------------------- 5. Privileges

REVOKE ALL ON FUNCTION public.tours_package_span_days(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tours_package_start_minute(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tours_booking_window(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tours_occupied_dates(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tours_window_with_buffer(int4range, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tours_tourist_busy_reason_for(uuid, date, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tours_window_text(int4range) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_window_text(int4range) TO authenticated;

-- ------------------------------------------------------- 6. Existing bookings
--
-- The rule above only guards new bookings. Production held one tourist with two
-- overlapping confirmed bookings on 2026-11-21 (an 8-hour Bagasbas tour with no
-- meeting time, and a 09:00 Rizal Monument tour inside it). Those rows are a
-- real customer's, so this migration does not touch them. To find others:
--
--   SELECT b.user_id, b.tour_date, count(*)
--     FROM tours_bookings b
--    WHERE b.status IN ('pending', 'confirmed')
--    GROUP BY 1, 2 HAVING count(*) > 1;
--
-- and ask the tourist which one to keep before cancelling anything.
