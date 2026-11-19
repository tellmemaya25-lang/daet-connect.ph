-- Door pickup quote suite (migration 20261219_door_pickup_quote.sql).
-- One DO block that ALWAYS rolls back (it ends by raising the report), so it is
-- safe on a live project:
--
--   psql "$DATABASE_URL" -f supabase/tests/door_pickup_quote.sql
--   (or paste into the Supabase SQL editor)
--
-- Read the result from the error: "REPORT pass=N fail=M [failures]".
-- Needs a published package (with a price option) of an approved operator, and a tourist.

DO $suite$
DECLARE
  pass int := 0;
  fails text := '';
  ok boolean;
  q jsonb;
  v_pkg uuid;
  v_variant uuid;
  v_owner uuid;
  v_tourist uuid;
  v_vehicle uuid;
  v_point uuid;
  v_booking uuid;
  v_fee numeric;
  v_total numeric;
  v_date date := (now() AT TIME ZONE 'Asia/Manila')::date + 27;
  -- Meeting point and a pin 6.9 km away by road (Bagasbas).
  m_lat double precision := 14.1147;
  m_lng double precision := 122.9548;
  b_lat double precision := 14.1395;
  b_lng double precision := 122.993;
BEGIN
  SELECT p.id, v.id, o.profile_id INTO v_pkg, v_variant, v_owner
  FROM tours_packages p
  JOIN tours_package_price_variants v ON v.package_id = p.id AND v.price_per_pax IS NOT NULL
  JOIN tours_operators o ON o.id = p.operator_id AND o.accreditation_status = 'approved'
  WHERE p.status = 'published' ORDER BY v.is_default DESC LIMIT 1;
  SELECT id INTO v_tourist FROM profiles WHERE role = 'tourist' LIMIT 1;
  IF v_pkg IS NULL OR v_tourist IS NULL THEN
    RAISE EXCEPTION 'REPORT setup incomplete: package=% tourist=%', v_pkg, v_tourist;
  END IF;

  -- Setup: a known meeting point, a known van rate, one van seating 3, up to 10 km.
  UPDATE tours_packages SET meeting_lat = m_lat, meeting_lng = m_lng WHERE id = v_pkg;
  INSERT INTO tours_official_pickup_rates (vehicle, base_fee, per_km_per_person, source, checked_on)
  VALUES ('van', 0, 2.60, 'Suite rate', current_date)
  ON CONFLICT (vehicle) DO UPDATE SET base_fee = 0, per_km_per_person = 2.60;
  DELETE FROM tours_package_pickup_vehicles WHERE package_id = v_pkg;
  INSERT INTO tours_package_pickup_vehicles (package_id, vehicle, label, seats, base_fee, per_km, max_km, sort_order)
  VALUES (v_pkg, 'van', 'Suite van', 3, 0, 0, 10, 0) RETURNING id INTO v_vehicle;
  INSERT INTO tours_package_availability (package_id, available_date, capacity_total, capacity_booked)
  VALUES (v_pkg, v_date, 50, 0)
  ON CONFLICT (package_id, available_date) DO UPDATE SET capacity_total = 50;

  -- 1. The formula: 6.9 km x 2 guests x P2.60 = P35.88 -> P36, with the vehicle's name.
  q := tours_quote_door_pickup(v_pkg, v_vehicle, b_lat, b_lng, 2, v_variant);
  IF (q->>'ok')::boolean AND (q->>'distance_km')::numeric = 6.9 AND (q->>'pickup_fee')::numeric = 36
     AND q->>'vehicle_label' = 'Suite van'
     AND (q->>'grand_total')::numeric = (q->>'tour_total')::numeric + 36 THEN pass := pass + 1;
  ELSE fails := fails || 'formula: ' || q::text || '; '; END IF;

  -- 2. Refusals carry a reason code.
  q := tours_quote_door_pickup(v_pkg, v_vehicle, b_lat, b_lng, 4);
  IF q->>'reason' = 'seats' THEN pass := pass + 1; ELSE fails := fails || 'seats: ' || q::text || '; '; END IF;
  q := tours_quote_door_pickup(v_pkg, v_vehicle, 13.6218, 123.1948, 2);
  IF q->>'reason' = 'too_far' THEN pass := pass + 1; ELSE fails := fails || 'too_far: ' || q::text || '; '; END IF;
  q := tours_quote_door_pickup(v_pkg, gen_random_uuid(), b_lat, b_lng, 2);
  IF q->>'reason' = 'no_vehicle' THEN pass := pass + 1; ELSE fails := fails || 'no_vehicle: ' || q::text || '; '; END IF;

  -- 3. The booking is charged exactly the quote.
  INSERT INTO tours_bookings (package_id, user_id, price_variant_id, tour_date, number_of_pax, contact_name, contact_email, contact_phone, booking_reference, status,
                              pickup_vehicle_id, pickup_lat, pickup_lng, pickup_note)
  VALUES (v_pkg, v_tourist, v_variant, v_date, 2, 'Pickup Test', 'pickup-test@example.invalid', '0917', 'BK-DOORQUOTE-1', 'pending',
          v_vehicle, b_lat, b_lng, 'Surf shop')
  RETURNING id, pickup_fee, total_amount INTO v_booking, v_fee, v_total;
  q := tours_quote_door_pickup(v_pkg, v_vehicle, b_lat, b_lng, 2, v_variant);
  IF v_fee = 36 AND v_total = (q->>'grand_total')::numeric THEN pass := pass + 1;
  ELSE fails := fails || format('booking charged %s / %s, quote %s; ', v_fee, v_total, q); END IF;

  -- 4. A refused quote refuses the booking, with the reason in the hint.
  BEGIN
    INSERT INTO tours_bookings (package_id, user_id, price_variant_id, tour_date, number_of_pax, contact_name, contact_email, contact_phone, booking_reference, status,
                                pickup_vehicle_id, pickup_lat, pickup_lng)
    VALUES (v_pkg, v_tourist, v_variant, v_date, 2, 'Pickup Test', 'pickup-test2@example.invalid', '0917', 'BK-DOORQUOTE-2', 'pending',
            v_vehicle, 13.6218, 123.1948);
    ok := false;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'too-far booking accepted; '; END IF;

  -- 5. A pickup point or door pickup, never both.
  INSERT INTO tours_package_pickup_points (package_id, name, fee, fee_per, sort_order)
  VALUES (v_pkg, 'Suite plaza', 50, 'booking', 0) RETURNING id INTO v_point;
  BEGIN
    INSERT INTO tours_bookings (package_id, user_id, price_variant_id, tour_date, number_of_pax, contact_name, contact_email, contact_phone, booking_reference, status,
                                pickup_point_id, pickup_vehicle_id, pickup_lat, pickup_lng)
    VALUES (v_pkg, v_tourist, v_variant, v_date, 2, 'Pickup Test', 'pickup-test3@example.invalid', '0917', 'BK-DOORQUOTE-3', 'pending',
            v_point, v_vehicle, b_lat, b_lng);
    ok := false;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'point + door accepted; '; END IF;

  -- 6. A pickup point alone still adds its fee once.
  INSERT INTO tours_bookings (package_id, user_id, price_variant_id, tour_date, number_of_pax, contact_name, contact_email, contact_phone, booking_reference, status,
                              pickup_point_id)
  VALUES (v_pkg, v_tourist, v_variant, v_date, 1, 'Pickup Test', 'pickup-test4@example.invalid', '0917', 'BK-DOORQUOTE-4', 'pending', v_point)
  RETURNING pickup_fee INTO v_fee;
  IF v_fee = 50 THEN pass := pass + 1; ELSE fails := fails || format('pickup point fee %s; ', v_fee); END IF;

  -- 7. One vehicle per tour, enforced by the database.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM tours_set_pickup_vehicles(v_pkg, '[{"vehicle":"van","seats":3,"max_km":10},{"vehicle":"van","seats":8,"max_km":20}]'::jsonb);
    ok := false;
  EXCEPTION WHEN invalid_parameter_value THEN ok := true;
  END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'two vehicles saved; '; END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);

  RAISE EXCEPTION 'REPORT pass=% fail=% [%]', pass, (length(fails) - length(replace(fails, ';', ''))), fails;
END;
$suite$;
