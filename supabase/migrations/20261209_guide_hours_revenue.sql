-- Guide scheduling by hours, and guide revenue tracking.
--
-- 1. A guide's available day can have hours (start_time..end_time). No hours
--    means the whole day, as before.
-- 2. A tour takes the package's time window: meeting_time for duration_value
--    hours. Day tours, and hour tours without a meeting time, take the whole day.
-- 3. The scheduling rule (tours_guide_busy_reason) now asks: do the guide's
--    hours cover the tour, and does it overlap another of their tours that day?
--    Two short tours on one day are fine when they don't overlap.
-- 4. Operators mark guide fees as paid; guides see paid and owed, per operator
--    and per month (tours_guide_revenue).

-- 1. Hours ---------------------------------------------------------------------

ALTER TABLE public.tours_guide_availability
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS end_time time;

ALTER TABLE public.tours_guide_availability DROP CONSTRAINT IF EXISTS tours_guide_availability_hours_check;
ALTER TABLE public.tours_guide_availability ADD CONSTRAINT tours_guide_availability_hours_check
  CHECK ((start_time IS NULL AND end_time IS NULL) OR (start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time));

/** Minutes from midnight a package's tour takes: [start, end). Whole day when it can't tell. */
CREATE OR REPLACE FUNCTION public.tours_package_window(p_package uuid)
RETURNS int4range
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT int4range(
             (extract(epoch FROM p.meeting_time) / 60)::int,
             LEAST(1440, (extract(epoch FROM p.meeting_time) / 60)::int + GREATEST(1, ceil(p.duration_value * 60))::int))
      FROM tours_packages p
     WHERE p.id = p_package AND p.duration_type = 'hours' AND p.meeting_time IS NOT NULL AND p.duration_value > 0
  ), int4range(0, 1440));
$$;

/** The minutes an availability row covers. */
CREATE OR REPLACE FUNCTION public.tours_availability_window(p_start time, p_end time)
RETURNS int4range
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN p_start IS NULL OR p_end IS NULL THEN int4range(0, 1440)
              ELSE int4range((extract(epoch FROM p_start) / 60)::int, (extract(epoch FROM p_end) / 60)::int) END;
$$;

-- 2. The rule ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tours_guide_busy_reason_for(p_guide uuid, p_date date, p_package uuid, p_exclude_booking uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH w AS (SELECT tours_package_window(p_package) AS win)
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM tours_guides g WHERE g.id = p_guide AND g.accreditation_status = 'approved') THEN 'not_approved'
    WHEN NOT EXISTS (
      SELECT 1 FROM tours_guide_availability a, w
       WHERE a.guide_id = p_guide AND a.available_date = p_date AND a.is_available
         AND tours_availability_window(a.start_time, a.end_time) @> w.win
    ) THEN 'not_available'
    WHEN EXISTS (
      SELECT 1 FROM tours_bookings b, w
       WHERE b.assigned_guide_id = p_guide AND b.tour_date = p_date
         AND b.status IN ('pending', 'confirmed')
         AND (p_exclude_booking IS NULL OR b.id <> p_exclude_booking)
         AND tours_package_window(b.package_id) && w.win
    ) THEN 'already_booked'
    ELSE NULL
  END;
$$;
REVOKE ALL ON FUNCTION public.tours_guide_busy_reason_for(uuid, date, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_guide_busy_reason_for(uuid, date, uuid, uuid) TO authenticated;

/** Same signature as before; the tour's hours come from the booking when there is one. */
CREATE OR REPLACE FUNCTION public.tours_guide_busy_reason(p_guide uuid, p_date date, p_exclude_booking uuid DEFAULT NULL)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tours_guide_busy_reason_for(p_guide, p_date, (SELECT package_id FROM tours_bookings WHERE id = p_exclude_booking), p_exclude_booking);
$$;

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
     AND NEW.tour_date IS NOT DISTINCT FROM OLD.tour_date THEN
    RETURN NEW;
  END IF;
  v_reason := tours_guide_busy_reason_for(NEW.assigned_guide_id, NEW.tour_date, NEW.package_id, NEW.id);
  IF v_reason IS NOT NULL THEN
    RAISE EXCEPTION 'guide_schedule:%', v_reason
      USING ERRCODE = 'P0001',
            HINT = 'The guide must be approved, available for the tour''s hours, and not on another tour at that time.';
  END IF;
  RETURN NEW;
END;
$$;

/** A guide can't narrow or drop hours that a booked tour needs. */
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
     WHERE b.assigned_guide_id = v_guide AND b.tour_date = v_date AND b.status IN ('pending', 'confirmed')
       AND (TG_OP = 'DELETE' OR NOT NEW.is_available
            OR NOT tours_availability_window(NEW.start_time, NEW.end_time) @> tours_package_window(b.package_id))
  ) THEN
    RAISE EXCEPTION 'guide_schedule:booked_that_day'
      USING ERRCODE = 'P0001', HINT = 'Ask the operator for a swap before changing hours you are booked for.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_tours_guide_availability_guard ON public.tours_guide_availability;
CREATE TRIGGER trg_tours_guide_availability_guard
  BEFORE UPDATE OF is_available, start_time, end_time OR DELETE ON public.tours_guide_availability
  FOR EACH ROW EXECUTE FUNCTION public.tours_guide_availability_guard();

/** The fair pick (20261208), now hours-aware: the tour's own window decides who is free. */
CREATE OR REPLACE FUNCTION public.tours_pick_guide(p_package_id uuid, p_date date, p_booking_id uuid, p_rejected uuid[])
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT g.id
    FROM tours_guides g
    JOIN tours_packages p ON p.id = p_package_id
    LEFT JOIN tours_package_guides pg ON pg.package_id = p.id AND pg.guide_id = g.id AND pg.is_active
    LEFT JOIN tours_guide_ratings r ON r.guide_id = g.id
   WHERE g.accreditation_status = 'approved'
     AND tours_guide_works_for(g.id, p.operator_id)
     AND (
       pg.guide_id IS NOT NULL
       OR EXISTS (SELECT 1 FROM tours_guide_service_areas sa WHERE sa.guide_id = g.id AND sa.municipality = p.municipality)
     )
     AND NOT (g.id = ANY (COALESCE(p_rejected, '{}')))
     AND tours_guide_busy_reason_for(g.id, p_date, p_package_id, p_booking_id) IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM tours_bookings o
        WHERE o.proposed_guide_id = g.id AND o.tour_date = p_date
          AND o.guide_proposal_status = 'proposed' AND o.status IN ('pending', 'confirmed')
          AND (p_booking_id IS NULL OR o.id <> p_booking_id)
          AND tours_package_window(o.package_id) && tours_package_window(p_package_id)
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

-- 3. Revenue tracking ---------------------------------------------------------------

ALTER TABLE public.tours_bookings
  ADD COLUMN IF NOT EXISTS guide_fee_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS guide_fee_paid_by uuid REFERENCES public.profiles(id);

/** Operator marks the guide fees of their completed tours paid (or not yet paid). Returns how many changed. */
CREATE OR REPLACE FUNCTION public.tours_operator_mark_guide_fees_paid(p_booking_ids uuid[], p_paid boolean)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operator uuid;
  v_count int;
BEGIN
  SELECT id INTO v_operator FROM tours_operators WHERE profile_id = auth.uid();
  IF v_operator IS NULL AND get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only the tour operator can mark guide fees paid.' USING ERRCODE = '42501';
  END IF;
  UPDATE tours_bookings b
     SET guide_fee_paid_at = CASE WHEN p_paid THEN now() END,
         guide_fee_paid_by = CASE WHEN p_paid THEN auth.uid() END
    FROM tours_packages p
   WHERE p.id = b.package_id
     AND b.id = ANY (COALESCE(p_booking_ids, '{}'))
     AND (v_operator IS NULL OR p.operator_id = v_operator)
     AND b.status = 'completed' AND b.assigned_guide_id IS NOT NULL AND b.guide_fee IS NOT NULL
     AND (b.guide_fee_paid_at IS NULL) = p_paid;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_operator_mark_guide_fees_paid(uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_operator_mark_guide_fees_paid(uuid[], boolean) TO authenticated;

/**
 * The signed-in guide's revenue for completed tours in a range: totals (earned,
 * paid, owed), per operator (with the agreed share), and per month (Manila).
 */
CREATE OR REPLACE FUNCTION public.tours_guide_revenue(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guide uuid;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 366 THEN
    RAISE EXCEPTION 'Choose a date range of up to one year.' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_guide FROM tours_guides WHERE profile_id = auth.uid();
  IF v_guide IS NULL THEN
    RAISE EXCEPTION 'Revenue is for guides.' USING ERRCODE = '42501';
  END IF;
  RETURN (
    WITH t AS (
      SELECT b.id, b.tour_date, b.guide_fee, b.guide_fee_paid_at, p.operator_id
        FROM tours_bookings b JOIN tours_packages p ON p.id = b.package_id
       WHERE b.assigned_guide_id = v_guide AND b.status = 'completed' AND b.tour_date BETWEEN p_from AND p_to
    )
    SELECT jsonb_build_object(
      'earned', (SELECT COALESCE(sum(guide_fee), 0) FROM t),
      'paid', (SELECT COALESCE(sum(guide_fee), 0) FROM t WHERE guide_fee_paid_at IS NOT NULL),
      'owed', (SELECT COALESCE(sum(guide_fee), 0) FROM t WHERE guide_fee_paid_at IS NULL),
      'paid_ids', (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM t WHERE guide_fee_paid_at IS NOT NULL),
      'operators', (
        SELECT COALESCE(jsonb_agg(x ORDER BY x->>'earned' DESC), '[]'::jsonb) FROM (
          SELECT jsonb_build_object(
                   'id', o.id, 'name', o.business_name,
                   'share_pct', (SELECT a.revenue_share_pct FROM tours_guide_applications a WHERE a.guide_id = v_guide AND a.operator_id = o.id AND a.status = 'active'),
                   'tours', count(*), 'earned', COALESCE(sum(t.guide_fee), 0),
                   'owed', COALESCE(sum(t.guide_fee) FILTER (WHERE t.guide_fee_paid_at IS NULL), 0)) AS x
            FROM t JOIN tours_operators o ON o.id = t.operator_id
           GROUP BY o.id, o.business_name
        ) s
      ),
      'months', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('month', m, 'tours', n, 'earned', e) ORDER BY m), '[]'::jsonb) FROM (
          SELECT to_char(tour_date, 'YYYY-MM') AS m, count(*) AS n, COALESCE(sum(guide_fee), 0) AS e FROM t GROUP BY 1
        ) s
      )
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.tours_guide_revenue(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_guide_revenue(date, date) TO authenticated;
