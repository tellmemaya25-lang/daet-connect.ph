-- Door pickup prices come from official fares, never from the operator.
--
-- tours_official_pickup_rates: one row per vehicle type, with the source it
-- was copied from. A vehicle type with no row has no official fare yet and
-- cannot be offered for door pickup.
--   fee = round(base_fee + per_km_per_person x km x guests)
--
-- Loaded now (checked 2026-11-15):
--   van: LTFRB provisional UV Express fare (traditional units), P2.60 per km
--        per passenger, effective 2026-09-28 (DOTr-approved provisional fare
--        adjustment; reported by PTV News, Rappler and others).
-- Not loaded: tricycle (Daet Ordinance No. 672-2026 sets P20.00 for the first
-- 2 km; the rate per succeeding km could not be read), habal-habal, car and
-- multicab (no official per-km fare found).

CREATE TABLE IF NOT EXISTS public.tours_official_pickup_rates (
  vehicle text PRIMARY KEY CHECK (vehicle IN ('tricycle', 'habal_habal', 'car', 'multicab', 'van')),
  base_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (base_fee >= 0),
  per_km_per_person numeric(10,2) NOT NULL CHECK (per_km_per_person > 0),
  source text NOT NULL CHECK (char_length(source) BETWEEN 3 AND 300),
  source_url text,
  effective_on date,
  checked_on date NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tours_official_pickup_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tours_official_pickup_rates_select ON public.tours_official_pickup_rates;
CREATE POLICY tours_official_pickup_rates_select ON public.tours_official_pickup_rates FOR SELECT USING (true);
REVOKE ALL ON public.tours_official_pickup_rates FROM anon, authenticated;
GRANT SELECT ON public.tours_official_pickup_rates TO anon, authenticated;

INSERT INTO public.tours_official_pickup_rates (vehicle, base_fee, per_km_per_person, source, source_url, effective_on, checked_on)
VALUES (
  'van', 0, 2.60,
  'LTFRB provisional UV Express fare (traditional units), P2.60 per km per passenger',
  'https://ptvnews.ph/ltfrb-releases-new-matrices-for-puv-fare-hikes-effective-sept-28/',
  '2026-09-28', '2026-11-15'
)
ON CONFLICT (vehicle) DO UPDATE SET
  base_fee = EXCLUDED.base_fee, per_km_per_person = EXCLUDED.per_km_per_person, source = EXCLUDED.source,
  source_url = EXCLUDED.source_url, effective_on = EXCLUDED.effective_on, checked_on = EXCLUDED.checked_on, updated_at = now();

-- Operators list vehicles without prices; only types with an official fare.
CREATE OR REPLACE FUNCTION public.tours_set_pickup_vehicles(p_package_id uuid, p_vehicles jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v jsonb;
  i integer := 0;
BEGIN
  IF NOT tours_can_manage_package(p_package_id) THEN
    RAISE EXCEPTION 'You can only change pickup vehicles on your own packages.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(COALESCE(p_vehicles, '[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(p_vehicles, '[]'::jsonb)) > 10 THEN
    RAISE EXCEPTION 'List up to 10 vehicles.' USING ERRCODE = '22023';
  END IF;
  DELETE FROM tours_package_pickup_vehicles WHERE package_id = p_package_id;
  FOR v IN SELECT * FROM jsonb_array_elements(COALESCE(p_vehicles, '[]'::jsonb)) LOOP
    IF NOT EXISTS (SELECT 1 FROM tours_official_pickup_rates r WHERE r.vehicle = v->>'vehicle') THEN
      RAISE EXCEPTION 'That vehicle has no official fare yet, so it can''t be offered for door pickup.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO tours_package_pickup_vehicles (package_id, vehicle, label, seats, base_fee, per_km, max_km, sort_order)
    VALUES (p_package_id, v->>'vehicle', NULLIF(btrim(COALESCE(v->>'label', '')), ''), (v->>'seats')::int, 0, 0, round((v->>'max_km')::numeric, 1), i);
    i := i + 1;
  END LOOP;
EXCEPTION
  WHEN invalid_text_representation OR not_null_violation THEN
    RAISE EXCEPTION 'Seats and distance must be numbers.' USING ERRCODE = '22023';
  WHEN check_violation THEN
    RAISE EXCEPTION 'Check the vehicle: 1 to 30 seats and a farthest pickup up to 200 km.' USING ERRCODE = '22023';
END;
$$;
REVOKE ALL ON FUNCTION public.tours_set_pickup_vehicles(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_set_pickup_vehicles(uuid, jsonb) TO authenticated;

-- The fee comes from the official rate.
CREATE OR REPLACE FUNCTION public.tours_bookings_door_pickup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v tours_package_pickup_vehicles%ROWTYPE;
  r tours_official_pickup_rates%ROWTYPE;
  p record;
  v_km numeric;
  v_fee numeric;
BEGIN
  IF NEW.pickup_vehicle_id IS NULL THEN
    NEW.pickup_lat := NULL; NEW.pickup_lng := NULL; NEW.pickup_note := NULL; NEW.pickup_km := NULL; NEW.pickup_vehicle := NULL;
    RETURN NEW;
  END IF;
  IF NEW.pickup_point_id IS NOT NULL THEN
    RAISE EXCEPTION 'Choose a pickup point or door pickup, not both.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v FROM tours_package_pickup_vehicles WHERE id = NEW.pickup_vehicle_id AND package_id = NEW.package_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose a pickup vehicle from the list.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO r FROM tours_official_pickup_rates WHERE vehicle = v.vehicle;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That vehicle has no official fare yet. Choose another.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.pickup_lat IS NULL OR NEW.pickup_lng IS NULL THEN
    RAISE EXCEPTION 'Pin where we should pick you up.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT meeting_lat, meeting_lng INTO p FROM tours_packages WHERE id = NEW.package_id;
  IF p.meeting_lat IS NULL OR p.meeting_lng IS NULL THEN
    RAISE EXCEPTION 'This tour has no meeting point on the map yet, so door pickup can''t be priced.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.number_of_pax > v.seats THEN
    RAISE EXCEPTION 'That vehicle seats % people. Choose a bigger one.', v.seats USING ERRCODE = 'check_violation';
  END IF;
  v_km := tours_road_km(NEW.pickup_lat, NEW.pickup_lng, p.meeting_lat::double precision, p.meeting_lng::double precision);
  IF v_km > v.max_km THEN
    RAISE EXCEPTION 'That is % km from the meeting point; this vehicle picks up within % km.', v_km, v.max_km USING ERRCODE = 'check_violation';
  END IF;
  v_fee := round(r.base_fee + r.per_km_per_person * v_km * NEW.number_of_pax);
  NEW.pickup_km := v_km;
  NEW.pickup_vehicle := v.vehicle;
  NEW.pickup_note := NULLIF(left(btrim(COALESCE(NEW.pickup_note, '')), 200), '');
  NEW.pickup_name := 'Door pickup' || COALESCE(': ' || NEW.pickup_note, '');
  NEW.pickup_fee := v_fee;
  NEW.total_amount := NEW.total_amount + v_fee;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_bookings_door_pickup() FROM PUBLIC, anon, authenticated;
