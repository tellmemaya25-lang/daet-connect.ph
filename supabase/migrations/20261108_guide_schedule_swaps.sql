-- Adviser revision R6: guides must have a schedule, and a guide can suggest
-- moving a tour to another guide (the operator decides).
-- See docs/ADVISER_REVISIONS.md#r6--guide-schedules-and-swap-requests.
--
-- 1. tours_guide_is_free(): the one scheduling rule (approved, marked
--    available that day, not on another active tour that day).
-- 2. Guards: bookings can't get a guide who isn't free; a guide can't mark
--    a booked day unavailable.
-- 3. tours_guide_swap_requests + RPCs (request, decide, cancel) and
--    tours_guides_free_on() for the pickers. Notifications reuse tours_notify;
--    the new guide and the tourist are already told by the guide_assigned
--    branch of tours_notify_booking_events.

-- 1. The rule ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tours_guide_busy_reason(p_guide uuid, p_date date, p_exclude_booking uuid DEFAULT NULL)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM tours_guides g WHERE g.id = p_guide AND g.accreditation_status = 'approved') THEN 'not_approved'
    WHEN NOT EXISTS (SELECT 1 FROM tours_guide_availability a WHERE a.guide_id = p_guide AND a.available_date = p_date AND a.is_available) THEN 'not_available'
    WHEN EXISTS (
      SELECT 1 FROM tours_bookings b
      WHERE b.assigned_guide_id = p_guide AND b.tour_date = p_date
        AND b.status IN ('pending', 'confirmed')
        AND (p_exclude_booking IS NULL OR b.id <> p_exclude_booking)
    ) THEN 'already_booked'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.tours_guide_is_free(p_guide uuid, p_date date, p_exclude_booking uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tours_guide_busy_reason(p_guide, p_date, p_exclude_booking) IS NULL;
$$;

-- 2. Guards -------------------------------------------------------------------

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
  v_reason := tours_guide_busy_reason(NEW.assigned_guide_id, NEW.tour_date, NEW.id);
  IF v_reason IS NOT NULL THEN
    RAISE EXCEPTION 'guide_schedule:%', v_reason
      USING ERRCODE = 'P0001',
            HINT = 'The guide must be approved, marked available that day, and not on another tour that day.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tours_bookings_guide_schedule ON public.tours_bookings;
CREATE TRIGGER trg_tours_bookings_guide_schedule
  BEFORE INSERT OR UPDATE OF assigned_guide_id, tour_date ON public.tours_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tours_bookings_guide_schedule_guard();

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
  IF TG_OP = 'UPDATE' AND NEW.is_available THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM tours_bookings b
    WHERE b.assigned_guide_id = v_guide AND b.tour_date = v_date AND b.status IN ('pending', 'confirmed')
  ) THEN
    RAISE EXCEPTION 'guide_schedule:booked_that_day'
      USING ERRCODE = 'P0001', HINT = 'Ask the operator for a swap before marking this day unavailable.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_tours_guide_availability_guard ON public.tours_guide_availability;
CREATE TRIGGER trg_tours_guide_availability_guard
  BEFORE UPDATE OF is_available OR DELETE ON public.tours_guide_availability
  FOR EACH ROW EXECUTE FUNCTION public.tours_guide_availability_guard();

-- 3. Swap requests ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tours_guide_swap_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.tours_bookings(id) ON DELETE CASCADE,
  from_guide_id uuid NOT NULL REFERENCES public.tours_guides(id) ON DELETE CASCADE,
  to_guide_id uuid REFERENCES public.tours_guides(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 300),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decision_note text CHECK (decision_note IS NULL OR char_length(decision_note) <= 300),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (to_guide_id IS NULL OR to_guide_id <> from_guide_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS tours_guide_swap_one_pending
  ON public.tours_guide_swap_requests (booking_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS tours_guide_swap_from_idx ON public.tours_guide_swap_requests (from_guide_id);
CREATE INDEX IF NOT EXISTS tours_guide_swap_to_idx ON public.tours_guide_swap_requests (to_guide_id);

ALTER TABLE public.tours_guide_swap_requests ENABLE ROW LEVEL SECURITY;

-- Readers: the requesting guide, the named guide, the booking's operator, admins.
-- Nobody writes directly; the RPCs below do.
DROP POLICY IF EXISTS "Swap requests are visible to the people involved" ON public.tours_guide_swap_requests;
CREATE POLICY "Swap requests are visible to the people involved" ON public.tours_guide_swap_requests
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'admin'
    OR EXISTS (SELECT 1 FROM tours_guides g WHERE g.profile_id = (SELECT auth.uid()) AND g.id IN (from_guide_id, to_guide_id))
    OR EXISTS (
      SELECT 1 FROM tours_bookings b
      JOIN tours_packages p ON p.id = b.package_id
      JOIN tours_operators o ON o.id = p.operator_id
      WHERE b.id = booking_id AND o.profile_id = (SELECT auth.uid())
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.tours_guide_swap_requests FROM anon, authenticated;
GRANT SELECT ON public.tours_guide_swap_requests TO authenticated;

-- Approved guides and whether each is free on a date, for the pickers.
CREATE OR REPLACE FUNCTION public.tours_guides_free_on(p_date date, p_exclude_booking uuid DEFAULT NULL)
RETURNS TABLE (guide_id uuid, full_name text, reason text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(get_my_role(), '') NOT IN ('operator', 'guide', 'admin') THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT g.id, COALESCE(pr.full_name, 'Guide')::text, tours_guide_busy_reason(g.id, p_date, p_exclude_booking)
    FROM tours_guides g
    LEFT JOIN profiles pr ON pr.id = g.profile_id
    WHERE g.accreditation_status = 'approved'
    ORDER BY 3 NULLS FIRST, 2;
END;
$$;

CREATE OR REPLACE FUNCTION public.tours_request_guide_swap(p_booking uuid, p_to_guide uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking tours_bookings;
  v_me uuid;
  v_id uuid;
  v_reason text := btrim(COALESCE(p_reason, ''));
  c record;
BEGIN
  SELECT * INTO v_booking FROM tours_bookings WHERE id = p_booking FOR UPDATE;
  SELECT id INTO v_me FROM tours_guides WHERE profile_id = auth.uid();
  IF v_booking.id IS NULL OR v_me IS NULL OR v_booking.assigned_guide_id IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'swap:not_your_tour' USING ERRCODE = '42501';
  END IF;
  IF v_booking.status NOT IN ('pending', 'confirmed') OR v_booking.tour_date < (now() AT TIME ZONE 'Asia/Manila')::date THEN
    RAISE EXCEPTION 'swap:tour_closed' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_reason) < 3 OR char_length(v_reason) > 300 THEN
    RAISE EXCEPTION 'swap:reason' USING ERRCODE = 'P0001';
  END IF;
  IF p_to_guide IS NOT NULL AND (p_to_guide = v_me OR NOT tours_guide_is_free(p_to_guide, v_booking.tour_date, v_booking.id)) THEN
    RAISE EXCEPTION 'swap:guide_not_free' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM tours_guide_swap_requests WHERE booking_id = p_booking AND status = 'pending') THEN
    RAISE EXCEPTION 'swap:already_pending' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO tours_guide_swap_requests (booking_id, from_guide_id, to_guide_id, reason)
  VALUES (p_booking, v_me, p_to_guide, v_reason)
  RETURNING id INTO v_id;

  SELECT * INTO c FROM tours_booking_context(p_booking);
  PERFORM tours_notify(c.operator_profile, 'guide_swap_requested', 'Guide asks for a swap',
    format('%s · %s (%s): %s', c.reference, c.title, c.tour_day, v_reason), '/tours/operator/bookings?swap=pending');
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tours_decide_guide_swap(p_request uuid, p_approve boolean, p_guide uuid DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r tours_guide_swap_requests;
  v_booking tours_bookings;
  v_new uuid;
  v_from_profile uuid;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  c record;
BEGIN
  SELECT * INTO r FROM tours_guide_swap_requests WHERE id = p_request FOR UPDATE;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'swap:not_found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_booking FROM tours_bookings WHERE id = r.booking_id FOR UPDATE;
  SELECT * INTO c FROM tours_booking_context(r.booking_id);
  IF c.operator_profile IS DISTINCT FROM auth.uid() AND COALESCE(get_my_role(), '') <> 'admin' THEN
    RAISE EXCEPTION 'swap:not_your_booking' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'swap:already_decided' USING ERRCODE = 'P0001';
  END IF;
  IF v_booking.tour_date < (now() AT TIME ZONE 'Asia/Manila')::date OR v_booking.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'swap:tour_closed' USING ERRCODE = 'P0001';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 300 THEN
    RAISE EXCEPTION 'swap:note' USING ERRCODE = 'P0001';
  END IF;
  SELECT profile_id INTO v_from_profile FROM tours_guides WHERE id = r.from_guide_id;

  IF NOT p_approve THEN
    UPDATE tours_guide_swap_requests SET status = 'rejected', decided_by = auth.uid(), decision_note = v_note, decided_at = now() WHERE id = r.id;
    PERFORM tours_notify(v_from_profile, 'guide_swap_rejected', 'Swap request declined',
      format('%s (%s): you stay on this tour.%s', c.title, c.tour_day, COALESCE(' ' || v_note, '')), '/tours/guide/my-tours');
    RETURN;
  END IF;

  v_new := COALESCE(p_guide, r.to_guide_id);
  IF v_new IS NULL THEN
    RAISE EXCEPTION 'swap:choose_guide' USING ERRCODE = 'P0001';
  END IF;
  IF v_new = r.from_guide_id OR NOT tours_guide_is_free(v_new, v_booking.tour_date, v_booking.id) THEN
    RAISE EXCEPTION 'swap:guide_not_free' USING ERRCODE = 'P0001';
  END IF;

  UPDATE tours_guide_swap_requests
     SET status = 'approved', to_guide_id = v_new, decided_by = auth.uid(), decision_note = v_note, decided_at = now()
   WHERE id = r.id;
  -- The schedule guard re-checks; tours_notify_booking_events tells the new guide and the tourist.
  UPDATE tours_bookings SET assigned_guide_id = v_new WHERE id = v_booking.id;
  PERFORM tours_notify(v_from_profile, 'guide_swap_approved', 'Swap approved',
    format('%s (%s) now has another guide. Thanks for the heads-up.', c.title, c.tour_day), '/tours/guide/my-tours');
END;
$$;

CREATE OR REPLACE FUNCTION public.tours_cancel_guide_swap(p_request uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE tours_guide_swap_requests r
     SET status = 'cancelled', decided_at = now()
   WHERE r.id = p_request AND r.status = 'pending'
     AND r.from_guide_id IN (SELECT id FROM tours_guides WHERE profile_id = auth.uid());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'swap:not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.tours_guide_busy_reason(uuid, date, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tours_guide_is_free(uuid, date, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tours_guides_free_on(date, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tours_request_guide_swap(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tours_decide_guide_swap(uuid, boolean, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tours_cancel_guide_swap(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tours_bookings_guide_schedule_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tours_guide_availability_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tours_guide_is_free(uuid, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tours_guides_free_on(date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tours_request_guide_swap(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tours_decide_guide_swap(uuid, boolean, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tours_cancel_guide_swap(uuid) TO authenticated;
