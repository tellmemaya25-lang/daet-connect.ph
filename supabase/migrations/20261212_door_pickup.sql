-- Door pickup ("pasundo"): the operator sends a vehicle to where the tourist
-- is and brings them to the tour's meeting point.
--
-- 1. tours_package_pickup_vehicles: per package, what the operator can send
--    (tricycle, car, van...), with seats, a base fee, a price per km, and the
--    farthest pickup they accept. Replaced as a list (tours_set_pickup_vehicles).
-- 2. Bookings keep the pin, a landmark note, the vehicle, the distance and
--    (as today) pickup_name / pickup_fee.
-- 3. The fee is worked out here, never trusted from the browser:
--      km  = straight-line distance pin -> meeting point x 1.4 (roads), 0.1 km
--      fee = base_fee + per_km x km, rounded to the peso
--    The vehicle must seat the group and the pickup must be within max_km.
--    The trigger runs after trg_tours_bookings_c_pickup_and_guide, which
--    resets pickup_fee for bookings without a pickup point.

-- 1. Vehicles ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tours_package_pickup_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.tours_packages(id) ON DELETE CASCADE,
  vehicle text NOT NULL CHECK (vehicle IN ('tricycle', 'habal_habal', 'car', 'multicab', 'van')),
  label text CHECK (label IS NULL OR char_length(label) <= 80),
  seats integer NOT NULL CHECK (seats BETWEEN 1 AND 30),
  base_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (base_fee >= 0 AND base_fee <= 100000),
  per_km numeric(10,2) NOT NULL DEFAULT 0 CHECK (per_km >= 0 AND per_km <= 10000),
  max_km numeric(6,1) NOT NULL DEFAULT 20 CHECK (max_km > 0 AND max_km <= 200),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tours_package_pickup_vehicles_package_idx ON public.tours_package_pickup_vehicles (package_id, sort_order);

ALTER TABLE public.tours_package_pickup_vehicles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tours_pickup_vehicles_select ON public.tours_package_pickup_vehicles;
CREATE POLICY tours_pickup_vehicles_select ON public.tours_package_pickup_vehicles
  FOR SELECT USING (
    (is_active AND EXISTS (SELECT 1 FROM tours_packages p WHERE p.id = package_id AND p.status = 'published'))
    OR tours_can_manage_package(package_id)
  );
REVOKE ALL ON public.tours_package_pickup_vehicles FROM anon, authenticated;
GRANT SELECT ON public.tours_package_pickup_vehicles TO anon, authenticated;

/** Operator (or admin) replaces a package's door-pickup vehicles. Bookings keep their own copy of the fee. */
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
    IF COALESCE(v->>'vehicle', '') NOT IN ('tricycle', 'habal_habal', 'car', 'multicab', 'van') THEN
      RAISE EXCEPTION 'Choose a vehicle type.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO tours_package_pickup_vehicles (package_id, vehicle, label, seats, base_fee, per_km, max_km, sort_order)
    VALUES (
      p_package_id, v->>'vehicle', NULLIF(btrim(COALESCE(v->>'label', '')), ''),
      (v->>'seats')::int, round((v->>'base_fee')::numeric, 2), round((v->>'per_km')::numeric, 2), round((v->>'max_km')::numeric, 1), i
    );
    i := i + 1;
  END LOOP;
EXCEPTION
  WHEN invalid_text_representation OR not_null_violation THEN
    RAISE EXCEPTION 'Seats, fees and distance must be numbers.' USING ERRCODE = '22023';
  WHEN check_violation THEN
    RAISE EXCEPTION 'Check the vehicle: 1 to 30 seats, fees from 0, and a farthest pickup up to 200 km.' USING ERRCODE = '22023';
END;
$$;
REVOKE ALL ON FUNCTION public.tours_set_pickup_vehicles(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_set_pickup_vehicles(uuid, jsonb) TO authenticated;

-- 2. Booking fields -------------------------------------------------------------

ALTER TABLE public.tours_bookings
  ADD COLUMN IF NOT EXISTS pickup_vehicle_id uuid REFERENCES public.tours_package_pickup_vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pickup_vehicle text,
  ADD COLUMN IF NOT EXISTS pickup_lat double precision CHECK (pickup_lat IS NULL OR pickup_lat BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS pickup_lng double precision CHECK (pickup_lng IS NULL OR pickup_lng BETWEEN -180 AND 180),
  ADD COLUMN IF NOT EXISTS pickup_note text CHECK (pickup_note IS NULL OR char_length(pickup_note) <= 200),
  ADD COLUMN IF NOT EXISTS pickup_km numeric(6,1);

-- 3. The fee ---------------------------------------------------------------------

/** Kilometres by road between two points: the straight line x 1.4 (as ROAD_FACTOR in lib/maps/geo.ts), to 0.1 km. */
CREATE OR REPLACE FUNCTION public.tours_road_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT round((2 * 6371.0088 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )) * 1.4)::numeric, 1);
$$;

CREATE OR REPLACE FUNCTION public.tours_bookings_door_pickup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v tours_package_pickup_vehicles%ROWTYPE;
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
  IF NEW.pickup_lat IS NULL OR NEW.pickup_lng IS NULL THEN
    RAISE EXCEPTION 'Pin where we should pick you up.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT meeting_lat, meeting_lng, meeting_point_name INTO p FROM tours_packages WHERE id = NEW.package_id;
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
  v_fee := round(v.base_fee + v.per_km * v_km);
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

-- "d_" sorts after "c_pickup_and_guide", which resets pickup_fee for bookings without a pickup point.
DROP TRIGGER IF EXISTS trg_tours_bookings_d_door_pickup ON public.tours_bookings;
CREATE TRIGGER trg_tours_bookings_d_door_pickup
  BEFORE INSERT ON public.tours_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tours_bookings_door_pickup();

-- The activity log records vehicle list changes too.
DROP TRIGGER IF EXISTS trg_tours_package_pickup_vehicles_activity ON public.tours_package_pickup_vehicles;
CREATE TRIGGER trg_tours_package_pickup_vehicles_activity AFTER INSERT OR UPDATE OR DELETE ON public.tours_package_pickup_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.tours_log_activity();
