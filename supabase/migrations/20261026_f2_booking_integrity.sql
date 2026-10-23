-- ================================================================
-- F2: Availability, capacity and booking lifecycle
--
-- 1. Seats per open date (tours_package_availability.capacity_booked) are
--    counted by the database from bookings, never written by users.
-- 2. Booking insert checks the date is open and has seats, holding a row
--    lock on that date so two tourists cannot take the last seat.
--    Packages without any open dates keep accepting any future date.
-- 3. Status changes follow one lifecycle (see src/lib/tours/booking-lifecycle.ts):
--    pending -> confirmed | rejected | cancelled; confirmed -> completed | cancelled.
-- 4. Tourist cancellation + operator approval + refund recording through
--    SECURITY DEFINER functions; the old tourist policy allowed approving
--    one's own request.
-- 5. Closes write loopholes: participants were readable/insertable by any
--    signed-in user; operators could edit prices of published packages
--    (policy + replace_* RPCs).
--
-- No statement removes objects: permissive policies are rewritten or
-- disabled in place with ALTER POLICY.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Seat counting
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_count_booked_seats(p_package_id uuid, p_date date)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(SUM(number_of_pax), 0)::int
  FROM tours_bookings
  WHERE package_id = p_package_id AND tour_date = p_date
    AND status IN ('pending', 'confirmed', 'completed');
$fn$;

CREATE OR REPLACE FUNCTION public.tours_availability_before_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.capacity_booked > 0 THEN
      RAISE EXCEPTION 'This date already has bookings. Set its capacity to the booked seats to stop new bookings instead.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  NEW.capacity_booked := public.tours_count_booked_seats(NEW.package_id, NEW.available_date);
  IF NEW.capacity_total < NEW.capacity_booked THEN
    RAISE EXCEPTION 'Capacity cannot be lower than the % seat(s) already booked on %.', NEW.capacity_booked, NEW.available_date
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE TRIGGER trg_tours_availability_before_write
BEFORE INSERT OR UPDATE OR DELETE ON tours_package_availability
FOR EACH ROW EXECUTE FUNCTION public.tours_availability_before_write();

CREATE OR REPLACE FUNCTION public.tours_bookings_sync_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE tours_package_availability
       SET capacity_booked = public.tours_count_booked_seats(OLD.package_id, OLD.tour_date)
     WHERE package_id = OLD.package_id AND available_date = OLD.tour_date;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE tours_package_availability
       SET capacity_booked = public.tours_count_booked_seats(NEW.package_id, NEW.tour_date)
     WHERE package_id = NEW.package_id AND available_date = NEW.tour_date;
  END IF;
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE TRIGGER trg_tours_bookings_sync_capacity
AFTER INSERT OR DELETE OR UPDATE OF status, number_of_pax, tour_date, package_id ON tours_bookings
FOR EACH ROW EXECUTE FUNCTION public.tours_bookings_sync_capacity();

-- Operators write only the date and capacity; seats are counted above.
REVOKE INSERT, UPDATE ON tours_package_availability FROM anon, authenticated;
GRANT INSERT (package_id, available_date, capacity_total) ON tours_package_availability TO authenticated;
GRANT UPDATE (capacity_total) ON tours_package_availability TO authenticated;

ALTER POLICY "Operator manages own availability" ON tours_package_availability TO authenticated
  USING (package_id IN (
    SELECT p.id FROM tours_packages p JOIN tours_operators o ON o.id = p.operator_id
    WHERE o.profile_id = auth.uid()
  ))
  WITH CHECK (package_id IN (
    SELECT p.id FROM tours_packages p JOIN tours_operators o ON o.id = p.operator_id
    WHERE o.profile_id = auth.uid() AND o.accreditation_status = 'approved'
  ));

-- Bring existing counts in line (all zero today; harmless if re-run).
UPDATE tours_package_availability a
   SET capacity_booked = public.tours_count_booked_seats(a.package_id, a.available_date);

-- ----------------------------------------------------------------
-- 2. Booking insert: price (from F1) + open date + seats, under a row lock
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_bookings_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_variant tours_package_price_variants%ROWTYPE;
  v_status package_status;
  v_slot tours_package_availability%ROWTYPE;
  v_left integer;
BEGIN
  SELECT status INTO v_status FROM tours_packages WHERE id = NEW.package_id;
  IF v_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'This package is not available for booking.' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.price_variant_id IS NULL THEN
    RAISE EXCEPTION 'Choose a price option.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_variant FROM tours_package_price_variants
   WHERE id = NEW.price_variant_id AND package_id = NEW.package_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected price option is not valid.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.number_of_pax < v_variant.min_pax OR (v_variant.max_pax IS NOT NULL AND NEW.number_of_pax > v_variant.max_pax) THEN
    RAISE EXCEPTION 'Number of participants is outside the allowed range for this option.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.tour_date < (now() AT TIME ZONE 'Asia/Manila')::date THEN
    RAISE EXCEPTION 'Tour date cannot be in the past.' USING ERRCODE = 'check_violation';
  END IF;

  -- Lock the open date (if any) so concurrent bookings for it run one at a time.
  SELECT * INTO v_slot FROM tours_package_availability
   WHERE package_id = NEW.package_id AND available_date = NEW.tour_date
   FOR UPDATE;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM tours_package_availability WHERE package_id = NEW.package_id) THEN
      RAISE EXCEPTION 'This date is not open for booking. Please choose one of the available dates.' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    v_left := v_slot.capacity_total - public.tours_count_booked_seats(NEW.package_id, NEW.tour_date);
    IF v_left < NEW.number_of_pax THEN
      IF v_left <= 0 THEN
        RAISE EXCEPTION 'This date is fully booked. Please choose another date.' USING ERRCODE = 'check_violation';
      END IF;
      RAISE EXCEPTION 'Only % seat(s) left on this date.', v_left USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF v_variant.price_per_pax IS NOT NULL THEN
    NEW.price_per_pax := v_variant.price_per_pax;
    NEW.total_amount := v_variant.price_per_pax * NEW.number_of_pax;
  ELSE
    NEW.price_per_pax := NULL;
    NEW.total_amount := v_variant.flat_price;
  END IF;

  NEW.status := 'pending';
  NEW.total_paid := 0;
  NEW.payment_status := 'unpaid';
  NEW.assigned_guide_id := NULL;
  NEW.cancellation_reason := NULL;
  NEW.cancelled_at := NULL;
  NEW.cancelled_by := NULL;
  RETURN NEW;
END;
$fn$;

-- ----------------------------------------------------------------
-- 3. Lifecycle guard
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_bookings_status_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_actor text;
  v_today date := (now() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    v_actor := 'system';
  ELSIF get_my_role() = 'admin' THEN
    v_actor := 'admin';
  ELSIF current_setting('tours.tourist_cancel', true) = 'on' AND OLD.user_id = auth.uid() THEN
    v_actor := 'tourist';
  ELSIF public.tours_is_booking_operator(OLD.id) THEN
    v_actor := 'operator';
  ELSE
    RAISE EXCEPTION 'You are not allowed to change this booking.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF OLD.status IN ('completed', 'cancelled', 'rejected') THEN
    RAISE EXCEPTION 'This booking is already %.', OLD.status USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = 'pending' AND NEW.status IN ('confirmed', 'rejected') AND v_actor <> 'tourist' THEN
    NULL;
  ELSIF OLD.status = 'pending' AND NEW.status = 'cancelled'
        AND (v_actor <> 'tourist' OR COALESCE(OLD.total_paid, 0) = 0) THEN
    NULL;
  ELSIF OLD.status = 'confirmed' AND NEW.status = 'completed' AND v_actor <> 'tourist' THEN
    IF OLD.tour_date > v_today THEN
      RAISE EXCEPTION 'A tour can be marked completed on or after the tour date.' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF OLD.status = 'confirmed' AND NEW.status = 'cancelled' AND v_actor <> 'tourist' THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'A % booking cannot become %.', OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'cancelled' THEN
    NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
    NEW.cancelled_by := COALESCE(NEW.cancelled_by, auth.uid());
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE TRIGGER trg_tours_bookings_status_guard
BEFORE UPDATE OF status ON tours_bookings
FOR EACH ROW EXECUTE FUNCTION public.tours_bookings_status_guard();

-- ----------------------------------------------------------------
-- 4a. Tourist cancellation: instant when pending + unpaid, else a request
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_request_cancellation(p_booking_id uuid, p_reason text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  b tours_bookings%ROWTYPE;
  v_existing tours_cancellations%ROWTYPE;
  v_reason text := trim(COALESCE(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to cancel a booking.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF length(v_reason) < 5 OR length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Tell the operator why you are cancelling (5 to 500 characters).' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO b FROM tours_bookings WHERE id = p_booking_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF now() >= (b.tour_date::timestamp AT TIME ZONE 'Asia/Manila') THEN
    RAISE EXCEPTION 'The tour date has started, so the booking can no longer be cancelled here. Contact the operator.' USING ERRCODE = 'check_violation';
  END IF;

  IF b.status = 'pending' AND COALESCE(b.total_paid, 0) = 0 THEN
    PERFORM set_config('tours.tourist_cancel', 'on', true);
    UPDATE tours_bookings
       SET status = 'cancelled', cancellation_reason = v_reason, cancelled_by = auth.uid(), cancelled_at = now()
     WHERE id = b.id;
    PERFORM set_config('tours.tourist_cancel', 'off', true);
    RETURN 'cancelled';
  END IF;

  IF b.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'This booking can no longer be cancelled.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_existing FROM tours_cancellations WHERE booking_id = b.id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.status <> 'rejected' THEN
      RAISE EXCEPTION 'You already asked to cancel this booking.' USING ERRCODE = 'unique_violation';
    END IF;
    UPDATE tours_cancellations
       SET reason = v_reason, status = 'requested', requested_by = auth.uid(), requested_at = now(),
           admin_notes = NULL, resolved_by = NULL, resolved_at = NULL
     WHERE id = v_existing.id;
  ELSE
    INSERT INTO tours_cancellations (booking_id, requested_by, reason) VALUES (b.id, auth.uid(), v_reason);
  END IF;
  RETURN 'requested';
END;
$fn$;

-- ----------------------------------------------------------------
-- 4b. Operator (or admin) approves or rejects a cancellation request
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_resolve_cancellation(p_cancellation_id uuid, p_approve boolean, p_notes text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  c tours_cancellations%ROWTYPE;
  b tours_bookings%ROWTYPE;
  v_notes text := NULLIF(trim(COALESCE(p_notes, '')), '');
  v_is_admin boolean := get_my_role() = 'admin';
BEGIN
  SELECT * INTO c FROM tours_cancellations WHERE id = p_cancellation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cancellation request not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT v_is_admin AND NOT (
    public.tours_is_booking_operator(c.booking_id)
    AND EXISTS (SELECT 1 FROM tours_operators WHERE profile_id = auth.uid() AND accreditation_status = 'approved')
  ) THEN
    RAISE EXCEPTION 'Only the approved operator of this booking can resolve it.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF c.status <> 'requested' THEN
    RAISE EXCEPTION 'This request was already handled.' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT p_approve THEN
    IF v_notes IS NULL OR length(v_notes) < 5 THEN
      RAISE EXCEPTION 'Explain to the tourist why the cancellation is declined (at least 5 characters).' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE tours_cancellations
       SET status = 'rejected', admin_notes = v_notes, resolved_by = auth.uid(), resolved_at = now()
     WHERE id = c.id;
    RETURN 'rejected';
  END IF;

  SELECT * INTO b FROM tours_bookings WHERE id = c.booking_id FOR UPDATE;
  IF b.status IN ('pending', 'confirmed') THEN
    UPDATE tours_bookings SET status = 'cancelled', cancellation_reason = c.reason WHERE id = b.id;
  END IF;
  UPDATE tours_cancellations
     SET status = 'approved', admin_notes = v_notes, resolved_by = auth.uid(), resolved_at = now()
   WHERE id = c.id;
  RETURN CASE WHEN COALESCE(b.total_paid, 0) > 0 THEN 'approved_refund_due' ELSE 'approved' END;
END;
$fn$;

-- ----------------------------------------------------------------
-- 4c. Operator records a refund for a cancelled/declined booking
--     (refunds are ledger rows with payment_status = 'refunded')
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_refundable_amount(p_booking_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT GREATEST(0,
    COALESCE(SUM(amount) FILTER (WHERE payment_status = 'completed'), 0)
    - COALESCE(SUM(amount) FILTER (WHERE payment_status = 'refunded'), 0))
  FROM tours_payments WHERE booking_id = p_booking_id;
$fn$;

CREATE OR REPLACE FUNCTION public.tours_record_refund(p_booking_id uuid, p_amount numeric, p_method text, p_reference text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  b tours_bookings%ROWTYPE;
  v_refundable numeric;
  v_ledger_method text;
BEGIN
  IF NOT (get_my_role() = 'admin' OR (
    public.tours_is_booking_operator(p_booking_id)
    AND EXISTS (SELECT 1 FROM tours_operators WHERE profile_id = auth.uid() AND accreditation_status = 'approved')
  )) THEN
    RAISE EXCEPTION 'Only the approved operator of this booking can record a refund.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO b FROM tours_bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF b.status NOT IN ('cancelled', 'rejected') THEN
    RAISE EXCEPTION 'Cancel or decline the booking before recording a refund.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_method NOT IN ('gcash', 'bank_transfer', 'cash', 'other') THEN
    RAISE EXCEPTION 'Choose how you refunded.' USING ERRCODE = 'check_violation';
  END IF;

  v_refundable := public.tours_refundable_amount(p_booking_id);
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > v_refundable THEN
    RAISE EXCEPTION 'You can refund at most %.', to_char(v_refundable, 'FM999999990.00') USING ERRCODE = 'check_violation';
  END IF;

  v_ledger_method := CASE WHEN p_method IN ('gcash', 'bank_transfer', 'cash') THEN p_method ELSE 'other' END;
  INSERT INTO tours_payments (booking_id, amount, payment_method, payment_status, provider, reference_number, payment_date, notes, recorded_by)
  VALUES (p_booking_id, p_amount, v_ledger_method, 'refunded', 'manual', NULLIF(trim(COALESCE(p_reference, '')), ''), now(), 'Refund', auth.uid());

  IF v_refundable - p_amount <= 0 THEN
    UPDATE tours_cancellations
       SET status = 'refund_confirmed', resolved_at = COALESCE(resolved_at, now())
     WHERE booking_id = p_booking_id AND status = 'approved';
  END IF;
  RETURN v_refundable - p_amount;
END;
$fn$;

-- ----------------------------------------------------------------
-- 4d. Cancellation visibility: reads only; writes go through the functions
-- ----------------------------------------------------------------
ALTER POLICY "Tourist views/creates own cancellation requests" ON tours_cancellations
  USING (false) WITH CHECK (false);
ALTER POLICY "Tourist views/creates own cancellation requests" ON tours_cancellations
  RENAME TO tours_cancellations_tourist_all_disabled;

CREATE POLICY tours_cancellations_select ON tours_cancellations FOR SELECT TO authenticated USING (
  public.tours_is_booking_tourist(booking_id) OR public.tours_is_booking_operator(booking_id)
);

-- ----------------------------------------------------------------
-- 5a. Participants: only the booking's tourist, operator, guide and admins
-- ----------------------------------------------------------------
ALTER POLICY "Allow authenticated read participants" ON tours_booking_participants TO authenticated USING (
  public.tours_is_booking_tourist(booking_id)
  OR public.tours_is_booking_operator(booking_id)
  OR public.tours_is_booking_guide(booking_id)
  OR get_my_role() = 'admin'
);
ALTER POLICY "Allow authenticated read participants" ON tours_booking_participants RENAME TO tours_booking_participants_select;
ALTER POLICY "Allow authenticated insert participants" ON tours_booking_participants TO authenticated
  WITH CHECK (public.tours_is_booking_tourist(booking_id));
ALTER POLICY "Allow authenticated insert participants" ON tours_booking_participants RENAME TO tours_booking_participants_insert;

-- ----------------------------------------------------------------
-- 5b. Prices and stops are editable only while a package is draft/rejected
-- ----------------------------------------------------------------
ALTER POLICY "Operators can manage price variants" ON tours_package_price_variants TO authenticated
  USING (package_id IN (
    SELECT p.id FROM tours_packages p JOIN tours_operators o ON p.operator_id = o.id
    WHERE o.profile_id = auth.uid() AND o.accreditation_status = 'approved' AND p.status IN ('draft', 'rejected')
  ))
  WITH CHECK (package_id IN (
    SELECT p.id FROM tours_packages p JOIN tours_operators o ON p.operator_id = o.id
    WHERE o.profile_id = auth.uid() AND o.accreditation_status = 'approved' AND p.status IN ('draft', 'rejected')
  ));

-- The replace_* RPCs keep their existing bodies under *_unchecked names
-- (no longer callable by clients); the public names check the status first.
ALTER FUNCTION public.replace_package_price_variants(uuid, jsonb) RENAME TO replace_package_price_variants_unchecked;
ALTER FUNCTION public.replace_package_stops(uuid, jsonb) RENAME TO replace_package_stops_unchecked;
REVOKE EXECUTE ON FUNCTION public.replace_package_price_variants_unchecked(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.replace_package_stops_unchecked(uuid, jsonb) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.replace_package_price_variants(p_package_id uuid, p_variants jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tours_packages tp JOIN tours_operators toper ON tp.operator_id = toper.id
    WHERE tp.id = p_package_id AND toper.profile_id = auth.uid()
      AND toper.accreditation_status = 'approved' AND tp.status IN ('draft', 'rejected')
  ) THEN
    RAISE EXCEPTION 'Package not found, access denied, or pricing is locked for this package status';
  END IF;
  PERFORM public.replace_package_price_variants_unchecked(p_package_id, p_variants);
END;
$fn$;

CREATE FUNCTION public.replace_package_stops(p_package_id uuid, p_stops jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tours_packages tp JOIN tours_operators toper ON tp.operator_id = toper.id
    WHERE tp.id = p_package_id AND toper.profile_id = auth.uid()
      AND toper.accreditation_status = 'approved' AND tp.status IN ('draft', 'rejected')
  ) THEN
    RAISE EXCEPTION 'Package not found, access denied, or stops are locked for this package status';
  END IF;
  PERFORM public.replace_package_stops_unchecked(p_package_id, p_stops);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.replace_package_price_variants(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.replace_package_stops(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_package_price_variants(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_package_stops(uuid, jsonb) TO authenticated;

-- ----------------------------------------------------------------
-- 6. Function privileges
-- ----------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.tours_count_booked_seats(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_availability_before_write() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_bookings_sync_capacity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_bookings_status_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_bookings_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tours_refundable_amount(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tours_request_cancellation(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tours_resolve_cancellation(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tours_record_refund(uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_refundable_amount(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tours_request_cancellation(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tours_resolve_cancellation(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tours_record_refund(uuid, numeric, text, text) TO authenticated;
