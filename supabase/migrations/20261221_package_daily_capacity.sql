-- Seats per day for packages that run without a dates calendar.
-- Before this, a package with no tours_package_availability rows took any
-- number of guests on any date. Now every date is capped at daily_capacity
-- unless the operator opens calendar dates, which keep their own seat counts.

ALTER TABLE public.tours_packages
  ADD COLUMN IF NOT EXISTS daily_capacity integer NOT NULL DEFAULT 20
  CHECK (daily_capacity BETWEEN 1 AND 500);

COMMENT ON COLUMN public.tours_packages.daily_capacity IS
  'Seats per date when the package has no calendar dates. Ignored once dates are opened.';

-- Column grants on this table are per column, so expose the new one for reading only.
GRANT SELECT (daily_capacity) ON public.tours_packages TO anon, authenticated;

-- Serialises bookings for one package and day when there is no calendar row to lock.
CREATE OR REPLACE FUNCTION public.tours_lock_package_day(p_package uuid, p_date date)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('package_day:' || p_package::text || p_date::text, 0));
$$;
REVOKE ALL ON FUNCTION public.tours_lock_package_day(uuid, date) FROM PUBLIC, anon, authenticated;

-- Operators change it here: RLS lets them edit draft packages only, and the cap
-- must be editable on published ones too.
CREATE OR REPLACE FUNCTION public.tours_set_daily_capacity(p_package uuid, p_capacity integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_capacity IS NULL OR p_capacity < 1 OR p_capacity > 500 THEN
    RAISE EXCEPTION 'Seats per day must be a whole number from 1 to 500.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM tours_packages p JOIN tours_operators o ON o.id = p.operator_id
     WHERE p.id = p_package
       AND ((o.profile_id = auth.uid() AND o.accreditation_status = 'approved') OR get_my_role() = 'admin')
  ) THEN
    RAISE EXCEPTION 'Package not found.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE tours_packages SET daily_capacity = p_capacity WHERE id = p_package;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_set_daily_capacity(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_set_daily_capacity(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.tours_bookings_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_variant tours_package_price_variants%ROWTYPE;
  v_pkg tours_packages%ROWTYPE;
  v_slot tours_package_availability%ROWTYPE;
  v_left integer;
  v_children integer;
  v_adults integer;
  v_free integer := 0;
  v_child_price numeric(10,2);
  v_base numeric(12,2);
  v_discount numeric(12,2) := 0;
  v_saving numeric(12,2) := 0;
  v_item jsonb;
  v_addon tours_package_addons%ROWTYPE;
  v_qty integer;
  v_max integer;
  v_lines jsonb := '[]'::jsonb;
  v_addons_total numeric(12,2) := 0;
  v_seen uuid[] := '{}';
BEGIN
  SELECT * INTO v_pkg FROM tours_packages WHERE id = NEW.package_id;
  IF v_pkg.status IS DISTINCT FROM 'published' THEN
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
  SELECT * INTO v_slot FROM tours_package_availability
   WHERE package_id = NEW.package_id AND available_date = NEW.tour_date
   FOR UPDATE;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM tours_package_availability WHERE package_id = NEW.package_id) THEN
      RAISE EXCEPTION 'This date is not open for booking. Please choose one of the available dates.' USING ERRCODE = 'check_violation';
    END IF;
    -- No calendar: the package's daily cap applies. No row to lock, so lock the day.
    PERFORM public.tours_lock_package_day(NEW.package_id, NEW.tour_date);
    v_left := v_pkg.daily_capacity - public.tours_count_booked_seats(NEW.package_id, NEW.tour_date);
  ELSE
    v_left := v_slot.capacity_total - public.tours_count_booked_seats(NEW.package_id, NEW.tour_date);
  END IF;
  IF v_left < NEW.number_of_pax THEN
    IF v_left <= 0 THEN
      RAISE EXCEPTION 'This date is fully booked. Please choose another date.' USING ERRCODE = 'check_violation';
    END IF;
    RAISE EXCEPTION 'Only % seat(s) left on this date.', v_left USING ERRCODE = 'check_violation';
  END IF;

  v_children := COALESCE(NEW.number_of_children, 0);
  IF v_children < 0 OR v_children > NEW.number_of_pax THEN
    RAISE EXCEPTION 'The number of children must be between 0 and the number of guests.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_children > 0 AND (v_variant.child_price_percent IS NULL OR v_variant.price_per_pax IS NULL) THEN
    RAISE EXCEPTION 'This price option has no child price.' USING ERRCODE = 'check_violation';
  END IF;

  IF v_variant.price_per_pax IS NOT NULL THEN
    v_adults := NEW.number_of_pax - v_children;
    v_child_price := round(v_variant.price_per_pax * COALESCE(v_variant.child_price_percent, 100) / 100.0, 2);
    IF v_variant.group_min_pax IS NOT NULL AND NEW.number_of_pax >= v_variant.group_min_pax THEN
      v_free := LEAST(COALESCE(v_variant.group_free_pax, 0), v_adults);
      v_discount := COALESCE(v_variant.group_discount_per_pax, 0) * (v_adults - v_free);
    END IF;
    v_base := v_variant.price_per_pax * (v_adults - v_free) + v_child_price * v_children - v_discount;
    v_saving := v_variant.price_per_pax * v_free + v_discount;
    NEW.price_per_pax := v_variant.price_per_pax;
  ELSE
    v_base := v_variant.flat_price;
    NEW.price_per_pax := NULL;
  END IF;

  IF jsonb_typeof(COALESCE(NEW.addons, '[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(NEW.addons, '[]'::jsonb)) > 20 THEN
    RAISE EXCEPTION 'Too many extras.' USING ERRCODE = 'check_violation';
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(NEW.addons, '[]'::jsonb)) LOOP
    BEGIN
      SELECT * INTO v_addon FROM tours_package_addons
       WHERE id = (v_item->>'addon_id')::uuid AND package_id = NEW.package_id;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'An extra is not valid.' USING ERRCODE = 'check_violation';
    END;
    IF NOT FOUND OR NOT v_addon.bookable THEN
      RAISE EXCEPTION 'An extra is not available for this trip.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_addon.id = ANY (v_seen) THEN
      RAISE EXCEPTION 'An extra was chosen twice.' USING ERRCODE = 'check_violation';
    END IF;
    v_seen := v_seen || v_addon.id;
    v_qty := COALESCE((v_item->>'quantity')::integer, 1);
    v_max := CASE WHEN v_addon.unit = 'per_person' THEN NEW.number_of_pax ELSE 20 END;
    IF v_qty < 1 OR v_qty > v_max THEN
      RAISE EXCEPTION 'Choose between 1 and % of %.', v_max, v_addon.name USING ERRCODE = 'check_violation';
    END IF;
    v_lines := v_lines || jsonb_build_object(
      'addon_id', v_addon.id, 'name', v_addon.name, 'unit', v_addon.unit,
      'unit_price', v_addon.price, 'quantity', v_qty, 'line_total', v_addon.price * v_qty,
      'needs_reservation', v_addon.needs_reservation);
    v_addons_total := v_addons_total + v_addon.price * v_qty;
  END LOOP;

  NEW.number_of_children := v_children;
  NEW.addons := v_lines;
  NEW.addons_total := v_addons_total;
  NEW.discount_total := v_saving;
  NEW.total_amount := GREATEST(0, v_base) + v_addons_total;
  NEW.deposit_amount := CASE WHEN v_pkg.deposit_per_pax IS NULL THEN NULL
                             ELSE LEAST(NEW.total_amount, v_pkg.deposit_per_pax * NEW.number_of_pax) END;
  NEW.deposit_refundable := v_pkg.deposit_refundable;

  NEW.status := 'pending';
  NEW.total_paid := 0;
  NEW.payment_status := 'unpaid';
  NEW.assigned_guide_id := NULL;
  NEW.cancellation_reason := NULL;
  NEW.cancelled_at := NULL;
  NEW.cancelled_by := NULL;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tours_reschedule_called_off(p_booking_id uuid, p_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  b tours_bookings%ROWTYPE;
  c record;
  v_slot tours_package_availability%ROWTYPE;
  v_uses_calendar boolean;
  v_today date := (now() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
  SELECT * INTO b FROM tours_bookings WHERE id = p_booking_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF b.status <> 'confirmed' OR b.called_off_at IS NULL OR b.call_off_resolution IS NOT NULL THEN
    RAISE EXCEPTION 'This booking has no called-off trip to reschedule.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_date IS NULL OR p_date <= v_today OR p_date > v_today + 365 THEN
    RAISE EXCEPTION 'Pick a date from tomorrow up to a year ahead.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_date = b.tour_date THEN
    RAISE EXCEPTION 'Pick a different date.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT EXISTS (SELECT 1 FROM tours_package_availability WHERE package_id = b.package_id) INTO v_uses_calendar;
  IF v_uses_calendar THEN
    SELECT * INTO v_slot FROM tours_package_availability
     WHERE package_id = b.package_id AND available_date = p_date FOR UPDATE;
    IF NOT FOUND OR v_slot.capacity_total - public.tours_count_booked_seats(b.package_id, p_date) < b.number_of_pax THEN
      RAISE EXCEPTION 'That date is not open or has fewer than % seat(s) left.', b.number_of_pax USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    PERFORM public.tours_lock_package_day(b.package_id, p_date);
    IF (SELECT daily_capacity FROM tours_packages WHERE id = b.package_id)
       - public.tours_count_booked_seats(b.package_id, p_date) < b.number_of_pax THEN
      RAISE EXCEPTION 'That date has fewer than % seat(s) left.', b.number_of_pax USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  UPDATE tours_bookings
     SET rescheduled_from = b.tour_date, tour_date = p_date, call_off_resolution = 'rescheduled'
   WHERE id = b.id;

  SELECT * INTO c FROM public.tours_booking_context(b.id);
  PERFORM tours_notify(c.operator_profile, 'trip_rescheduled', 'Called-off trip moved',
    format('%s · %s moved to %s.', c.reference, c.title, c.tour_day), '/tours/operator/bookings');
  PERFORM tours_notify(c.guide_profile, 'trip_rescheduled', 'Trip moved',
    format('%s moved to %s.', c.title, c.tour_day), '/tours/guide/my-tours');
END;
$function$;
