-- Door pickup quote: the only place the door pickup price is worked out.
--
-- tours_quote_door_pickup(package, vehicle, lat, lng, pax, variant) returns
--   { ok, reason?, distance_km, pickup_fee, tour_total, grand_total, vehicle_label, seats, max_km }
-- reason is one of: no_pin, no_meeting, no_vehicle, no_rate, seats, too_far.
-- The booking form shows it; the booking trigger charges it.
--   fee = round(base_fee + per_km_per_person x road km x guests)
--
-- Also:
--  * One booking trigger (trg_tours_bookings_c_pickup) sets the pickup fee from
--    a pickup point OR door pickup, never both. The guide part of
--    tours_bookings_pickup_and_guide no longer touches pickup, so trigger name
--    order no longer matters. trg_tours_bookings_d_door_pickup is dropped.
--  * tours_set_pickup_vehicles enforces one vehicle per tour.
--  * Existing bookings are not changed.

CREATE OR REPLACE FUNCTION public.tours_quote_door_pickup(
  p_package_id uuid, p_vehicle_id uuid, p_lat double precision, p_lng double precision, p_pax integer, p_variant_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v tours_package_pickup_vehicles%ROWTYPE;
  r tours_official_pickup_rates%ROWTYPE;
  p record;
  pv record;
  v_label text;
  v_km numeric;
  v_fee numeric;
  v_tour numeric := NULL;
  v_pax integer := greatest(COALESCE(p_pax, 1), 1);
BEGIN
  SELECT id, meeting_lat, meeting_lng, status INTO p FROM tours_packages WHERE id = p_package_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_vehicle');
  END IF;
  IF p_variant_id IS NOT NULL THEN
    SELECT price_per_pax, flat_price INTO pv FROM tours_package_price_variants WHERE id = p_variant_id AND package_id = p_package_id;
    IF FOUND THEN
      v_tour := COALESCE(pv.price_per_pax * v_pax, pv.flat_price, 0);
    END IF;
  END IF;

  SELECT * INTO v FROM tours_package_pickup_vehicles WHERE id = p_vehicle_id AND package_id = p_package_id AND is_active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_vehicle', 'tour_total', v_tour);
  END IF;
  v_label := COALESCE(NULLIF(btrim(v.label), ''), CASE v.vehicle
    WHEN 'tricycle' THEN 'Tricycle' WHEN 'habal_habal' THEN 'Habal-habal (motorbike)' WHEN 'car' THEN 'Car'
    WHEN 'multicab' THEN 'Multicab' WHEN 'van' THEN 'Van' ELSE v.vehicle END);

  SELECT * INTO r FROM tours_official_pickup_rates WHERE vehicle = v.vehicle;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_rate', 'vehicle_label', v_label, 'tour_total', v_tour);
  END IF;
  IF p.meeting_lat IS NULL OR p.meeting_lng IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_meeting', 'vehicle_label', v_label, 'tour_total', v_tour);
  END IF;
  IF p_lat IS NULL OR p_lng IS NULL OR abs(p_lat) > 90 OR abs(p_lng) > 180 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pin', 'vehicle_label', v_label, 'tour_total', v_tour);
  END IF;

  v_km := tours_road_km(p_lat, p_lng, p.meeting_lat::double precision, p.meeting_lng::double precision);
  IF v_pax > v.seats THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'seats', 'distance_km', v_km, 'vehicle_label', v_label, 'seats', v.seats, 'max_km', v.max_km, 'tour_total', v_tour);
  END IF;
  IF v_km > v.max_km THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_far', 'distance_km', v_km, 'vehicle_label', v_label, 'seats', v.seats, 'max_km', v.max_km, 'tour_total', v_tour);
  END IF;

  v_fee := round(r.base_fee + r.per_km_per_person * v_km * v_pax);
  RETURN jsonb_build_object(
    'ok', true, 'distance_km', v_km, 'pickup_fee', v_fee, 'vehicle_label', v_label, 'seats', v.seats, 'max_km', v.max_km,
    'tour_total', v_tour, 'grand_total', CASE WHEN v_tour IS NULL THEN NULL ELSE v_tour + v_fee END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.tours_quote_door_pickup(uuid, uuid, double precision, double precision, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tours_quote_door_pickup(uuid, uuid, double precision, double precision, integer, uuid) TO anon, authenticated;

-- One trigger owns the pickup fee.
CREATE OR REPLACE FUNCTION public.tours_bookings_pickup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_point tours_package_pickup_points%ROWTYPE;
  q jsonb;
BEGIN
  NEW.pickup_name := NULL;
  NEW.pickup_fee := 0;
  IF NEW.pickup_point_id IS NOT NULL AND NEW.pickup_vehicle_id IS NOT NULL THEN
    RAISE EXCEPTION 'Choose a pickup point or door pickup, not both.' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.pickup_vehicle_id IS NULL THEN
    NEW.pickup_lat := NULL; NEW.pickup_lng := NULL; NEW.pickup_note := NULL; NEW.pickup_km := NULL; NEW.pickup_vehicle := NULL;
  END IF;

  IF NEW.pickup_point_id IS NOT NULL THEN
    SELECT * INTO v_point FROM tours_package_pickup_points
     WHERE id = NEW.pickup_point_id AND package_id = NEW.package_id AND is_active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Choose a pickup point from the list.' USING ERRCODE = 'check_violation';
    END IF;
    NEW.pickup_name := v_point.name;
    NEW.pickup_fee := CASE WHEN v_point.fee_per = 'person' THEN v_point.fee * NEW.number_of_pax ELSE v_point.fee END;
  ELSIF NEW.pickup_vehicle_id IS NOT NULL THEN
    q := tours_quote_door_pickup(NEW.package_id, NEW.pickup_vehicle_id, NEW.pickup_lat, NEW.pickup_lng, NEW.number_of_pax);
    IF NOT (q->>'ok')::boolean THEN
      RAISE EXCEPTION '%', CASE q->>'reason'
        WHEN 'no_vehicle' THEN 'Choose a pickup vehicle from the list.'
        WHEN 'no_rate' THEN 'That vehicle has no official fare yet. Choose another.'
        WHEN 'no_meeting' THEN 'This tour has no meeting point on the map yet, so door pickup can''t be priced.'
        WHEN 'no_pin' THEN 'Pin where we should pick you up.'
        WHEN 'seats' THEN format('That vehicle seats %s people.', q->>'seats')
        WHEN 'too_far' THEN format('That is %s km from the meeting point; this vehicle picks up within %s km.', q->>'distance_km', q->>'max_km')
        ELSE 'Door pickup can''t be priced.' END
      USING ERRCODE = 'check_violation', HINT = 'door_pickup:' || (q->>'reason');
    END IF;
    NEW.pickup_km := (q->>'distance_km')::numeric;
    NEW.pickup_vehicle := (SELECT vehicle FROM tours_package_pickup_vehicles WHERE id = NEW.pickup_vehicle_id);
    NEW.pickup_note := NULLIF(left(btrim(COALESCE(NEW.pickup_note, '')), 200), '');
    NEW.pickup_name := 'Door pickup' || COALESCE(': ' || NEW.pickup_note, '');
    NEW.pickup_fee := (q->>'pickup_fee')::numeric;
  END IF;
  NEW.total_amount := NEW.total_amount + NEW.pickup_fee;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_bookings_pickup() FROM PUBLIC, anon, authenticated;

-- The guide part only (pickup moved to tours_bookings_pickup).
CREATE OR REPLACE FUNCTION public.tours_bookings_pickup_and_guide()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_guide uuid;
BEGIN
  NEW.guide_fee := NULL;
  NEW.proposed_guide_id := NULL;
  NEW.guide_proposal_status := NULL;
  NEW.guide_proposed_by := NULL;
  NEW.guide_proposed_at := NULL;
  NEW.rejected_guide_ids := '{}';

  IF NEW.guide_not_needed_at IS NULL AND tours_package_has_guide_pool(NEW.package_id) THEN
    v_guide := tours_pick_guide(NEW.package_id, NEW.tour_date, NEW.id, '{}');
    NEW.proposed_guide_id := v_guide;
    NEW.guide_proposal_status := CASE WHEN v_guide IS NULL THEN 'none_available' ELSE 'proposed' END;
    NEW.guide_proposed_by := 'auto';
    NEW.guide_proposed_at := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tours_bookings_pickup_and_guide() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tours_bookings_d_door_pickup ON public.tours_bookings;
DROP FUNCTION IF EXISTS public.tours_bookings_door_pickup();
DROP TRIGGER IF EXISTS trg_tours_bookings_c_pickup ON public.tours_bookings;
CREATE TRIGGER trg_tours_bookings_c_pickup
  BEFORE INSERT ON public.tours_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tours_bookings_pickup();

-- One vehicle per tour, enforced here (not only in the app).
CREATE OR REPLACE FUNCTION public.tours_set_pickup_vehicles(p_package_id uuid, p_vehicles jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v jsonb;
  i integer := 0;
BEGIN
  IF NOT tours_can_manage_package(p_package_id) THEN
    RAISE EXCEPTION 'You can only change pickup vehicles on your own packages.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(COALESCE(p_vehicles, '[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(p_vehicles, '[]'::jsonb)) > 1 THEN
    RAISE EXCEPTION 'Set one pickup vehicle for this tour.' USING ERRCODE = '22023';
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
