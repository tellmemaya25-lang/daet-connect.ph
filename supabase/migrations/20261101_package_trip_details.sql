-- Package trip details, for real listings such as Kalmado Tour Services'
-- Calaguas camping trips:
--   * a day-by-day itinerary;
--   * optional extras with a price and a unit (tent upgrades, cabanas per
--     night, generator per hour, snorkel rental);
--   * child pricing and a group deal on a price option;
--   * a reservation fee per person, and the operator's own cancellation terms;
--   * things to bring and other notes.
-- Booking totals stay computed by the database (tours_bookings_before_insert),
-- now including children, the group deal and chosen extras.

-- ---------------------------------------------------------------------------
-- Package fields
-- ---------------------------------------------------------------------------
ALTER TABLE public.tours_packages
  ADD COLUMN IF NOT EXISTS things_to_bring text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS good_to_know text,
  ADD COLUMN IF NOT EXISTS deposit_per_pax numeric(10,2),
  ADD COLUMN IF NOT EXISTS deposit_refundable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cancellation_policy text;

ALTER TABLE public.tours_packages
  ADD CONSTRAINT tours_packages_deposit_positive CHECK (deposit_per_pax IS NULL OR deposit_per_pax > 0),
  ADD CONSTRAINT tours_packages_good_to_know_len CHECK (good_to_know IS NULL OR char_length(good_to_know) <= 2000),
  ADD CONSTRAINT tours_packages_cancellation_policy_len CHECK (cancellation_policy IS NULL OR char_length(cancellation_policy) <= 1000),
  ADD CONSTRAINT tours_packages_things_to_bring_len CHECK (cardinality(things_to_bring) <= 30);

-- ---------------------------------------------------------------------------
-- Price option rules: children and group deal
-- ---------------------------------------------------------------------------
ALTER TABLE public.tours_package_price_variants
  ADD COLUMN IF NOT EXISTS child_max_age integer,
  ADD COLUMN IF NOT EXISTS child_price_percent integer,
  ADD COLUMN IF NOT EXISTS group_min_pax integer,
  ADD COLUMN IF NOT EXISTS group_discount_per_pax numeric(10,2),
  ADD COLUMN IF NOT EXISTS group_free_pax integer;

ALTER TABLE public.tours_package_price_variants
  ADD CONSTRAINT tours_variants_child_rule CHECK (
    (child_max_age IS NULL AND child_price_percent IS NULL)
    OR (child_max_age BETWEEN 0 AND 17 AND child_price_percent BETWEEN 0 AND 100)
  ),
  ADD CONSTRAINT tours_variants_group_rule CHECK (
    (group_min_pax IS NULL AND group_discount_per_pax IS NULL AND group_free_pax IS NULL)
    OR (group_min_pax >= 2
        AND COALESCE(group_discount_per_pax, 0) >= 0
        AND COALESCE(group_free_pax, 0) BETWEEN 0 AND group_min_pax - 1
        AND (COALESCE(group_discount_per_pax, 0) > 0 OR COALESCE(group_free_pax, 0) > 0))
  );

-- ---------------------------------------------------------------------------
-- Itinerary
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tours_package_itinerary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.tours_packages(id) ON DELETE CASCADE,
  day_number integer NOT NULL CHECK (day_number BETWEEN 1 AND 14),
  start_time text CHECK (start_time IS NULL OR char_length(start_time) BETWEEN 1 AND 20),
  activity text NOT NULL CHECK (char_length(activity) BETWEEN 1 AND 300),
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tours_package_itinerary_package_idx ON public.tours_package_itinerary (package_id, day_number, display_order);

-- ---------------------------------------------------------------------------
-- Optional extras
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.tours_addon_unit AS ENUM ('per_booking', 'per_person', 'per_night', 'per_hour', 'per_item');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.tours_package_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.tours_packages(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  price numeric(10,2) NOT NULL CHECK (price >= 0),
  unit public.tours_addon_unit NOT NULL DEFAULT 'per_booking',
  max_guests integer CHECK (max_guests IS NULL OR max_guests BETWEEN 1 AND 100),
  needs_reservation boolean NOT NULL DEFAULT false,
  -- false: listed for information only and paid on site (e.g. generator hours).
  bookable boolean NOT NULL DEFAULT true,
  note text CHECK (note IS NULL OR char_length(note) <= 300),
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tours_package_addons_package_idx ON public.tours_package_addons (package_id, display_order);

-- Reads: published packages for everyone, own packages for operators, all for
-- admins. Writes go through tours_save_package_details only.
ALTER TABLE public.tours_package_itinerary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tours_package_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public views itinerary of published packages" ON public.tours_package_itinerary
  FOR SELECT TO anon, authenticated
  USING (package_id IN (SELECT p.id FROM public.tours_packages p WHERE p.status = 'published'));
CREATE POLICY "Operator views own package itinerary" ON public.tours_package_itinerary
  FOR SELECT TO authenticated
  USING (package_id IN (SELECT p.id FROM public.tours_packages p JOIN public.tours_operators o ON o.id = p.operator_id WHERE o.profile_id = (SELECT auth.uid())));
CREATE POLICY "Admin views all package itinerary" ON public.tours_package_itinerary
  FOR SELECT TO authenticated
  USING ((SELECT public.get_my_role()) = 'admin');

CREATE POLICY "Public views extras of published packages" ON public.tours_package_addons
  FOR SELECT TO anon, authenticated
  USING (package_id IN (SELECT p.id FROM public.tours_packages p WHERE p.status = 'published'));
CREATE POLICY "Operator views own package extras" ON public.tours_package_addons
  FOR SELECT TO authenticated
  USING (package_id IN (SELECT p.id FROM public.tours_packages p JOIN public.tours_operators o ON o.id = p.operator_id WHERE o.profile_id = (SELECT auth.uid())));
CREATE POLICY "Admin views all package extras" ON public.tours_package_addons
  FOR SELECT TO authenticated
  USING ((SELECT public.get_my_role()) = 'admin');

-- ---------------------------------------------------------------------------
-- Booking fields (written by the insert trigger, never by clients afterwards;
-- authenticated has UPDATE only on the status columns)
-- ---------------------------------------------------------------------------
ALTER TABLE public.tours_bookings
  ADD COLUMN IF NOT EXISTS number_of_children integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS addons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS addons_total numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_total numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS deposit_refundable boolean NOT NULL DEFAULT true;

ALTER TABLE public.tours_bookings
  ADD CONSTRAINT tours_bookings_children_range CHECK (number_of_children >= 0 AND number_of_children <= number_of_pax),
  ADD CONSTRAINT tours_bookings_addons_array CHECK (jsonb_typeof(addons) = 'array');

-- ---------------------------------------------------------------------------
-- Booking price: base (adults, children at their percent), group deal,
-- chosen extras, reservation fee. Same maths as src/lib/tours/quote.ts.
-- ---------------------------------------------------------------------------
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
  ELSE
    v_left := v_slot.capacity_total - public.tours_count_booked_seats(NEW.package_id, NEW.tour_date);
    IF v_left < NEW.number_of_pax THEN
      IF v_left <= 0 THEN
        RAISE EXCEPTION 'This date is fully booked. Please choose another date.' USING ERRCODE = 'check_violation';
      END IF;
      RAISE EXCEPTION 'Only % seat(s) left on this date.', v_left USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Children pay their percent of the per-person price, only where the option has a child price.
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
    -- Group deal: from group_min_pax guests, some adults go free and paying adults get money off.
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

  -- Chosen extras: priced here from the package's own list; the client sends only ids and quantities.
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

-- ---------------------------------------------------------------------------
-- Saving trip details. The owner (an approved operator) or an admin.
-- draft / rejected: everything. published: itinerary, things to bring and
-- notes only (prices, extras and terms change through review).
-- pending_review / archived: read-only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_save_package_details(p_package_id uuid, p_details jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pkg tours_packages%ROWTYPE;
  v_admin boolean := get_my_role() = 'admin';
  v_full boolean;
  v_item jsonb;
  v_i integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to edit this package.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_pkg FROM tours_packages WHERE id = p_package_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT v_admin AND NOT EXISTS (
    SELECT 1 FROM tours_operators o WHERE o.id = v_pkg.operator_id AND o.profile_id = auth.uid() AND o.accreditation_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Only the package''s operator can edit it.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_pkg.status IN ('pending_review', 'archived') AND NOT v_admin THEN
    RAISE EXCEPTION 'This package can''t be edited while it is %.', replace(v_pkg.status::text, '_', ' ') USING ERRCODE = 'check_violation';
  END IF;
  v_full := v_admin OR v_pkg.status IN ('draft', 'rejected');

  -- Text details (any editable status).
  IF p_details ? 'itinerary' THEN
    DELETE FROM tours_package_itinerary WHERE package_id = p_package_id;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_details->'itinerary') LOOP
      v_i := v_i + 1;
      INSERT INTO tours_package_itinerary (package_id, day_number, start_time, activity, display_order)
      VALUES (p_package_id, (v_item->>'day_number')::int, NULLIF(trim(v_item->>'start_time'), ''), trim(v_item->>'activity'), v_i);
    END LOOP;
  END IF;
  IF p_details ? 'things_to_bring' THEN
    UPDATE tours_packages SET things_to_bring = ARRAY(
      SELECT trim(x) FROM jsonb_array_elements_text(p_details->'things_to_bring') x WHERE trim(x) <> '')
    WHERE id = p_package_id;
  END IF;
  IF p_details ? 'good_to_know' THEN
    UPDATE tours_packages SET good_to_know = NULLIF(trim(p_details->>'good_to_know'), '') WHERE id = p_package_id;
  END IF;

  -- Money and terms (draft / rejected only).
  IF (p_details ? 'addons' OR p_details ? 'deposit_per_pax' OR p_details ? 'deposit_refundable'
      OR p_details ? 'cancellation_policy' OR p_details ? 'variant_rules') AND NOT v_full THEN
    RAISE EXCEPTION 'Prices, extras and terms of a published package change through review. Copy it to a new draft, or ask the Tourism Office.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_details ? 'addons' THEN
    DELETE FROM tours_package_addons WHERE package_id = p_package_id;
    v_i := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_details->'addons') LOOP
      v_i := v_i + 1;
      INSERT INTO tours_package_addons (package_id, name, price, unit, max_guests, needs_reservation, bookable, note, display_order)
      VALUES (p_package_id, trim(v_item->>'name'), (v_item->>'price')::numeric,
              COALESCE(v_item->>'unit', 'per_booking')::tours_addon_unit,
              NULLIF(v_item->>'max_guests', '')::int,
              COALESCE((v_item->>'needs_reservation')::boolean, false),
              COALESCE((v_item->>'bookable')::boolean, true),
              NULLIF(trim(v_item->>'note'), ''), v_i);
    END LOOP;
  END IF;
  IF p_details ? 'deposit_per_pax' THEN
    UPDATE tours_packages SET deposit_per_pax = NULLIF(p_details->>'deposit_per_pax', '')::numeric WHERE id = p_package_id;
  END IF;
  IF p_details ? 'deposit_refundable' THEN
    UPDATE tours_packages SET deposit_refundable = (p_details->>'deposit_refundable')::boolean WHERE id = p_package_id;
  END IF;
  IF p_details ? 'cancellation_policy' THEN
    UPDATE tours_packages SET cancellation_policy = NULLIF(trim(p_details->>'cancellation_policy'), '') WHERE id = p_package_id;
  END IF;
  IF p_details ? 'variant_rules' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_details->'variant_rules') LOOP
      UPDATE tours_package_price_variants SET
        child_max_age = NULLIF(v_item->>'child_max_age', '')::int,
        child_price_percent = NULLIF(v_item->>'child_price_percent', '')::int,
        group_min_pax = NULLIF(v_item->>'group_min_pax', '')::int,
        group_discount_per_pax = NULLIF(v_item->>'group_discount_per_pax', '')::numeric,
        group_free_pax = NULLIF(v_item->>'group_free_pax', '')::int
      WHERE id = (v_item->>'variant_id')::uuid AND package_id = p_package_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'A price option was not found on this package.' USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
  END IF;

  UPDATE tours_packages SET updated_at = now() WHERE id = p_package_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.tours_save_package_details(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tours_save_package_details(uuid, jsonb) TO authenticated;
