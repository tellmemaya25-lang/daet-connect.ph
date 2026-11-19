-- Rolled-back suite for 20261221_package_daily_capacity.sql. Always ends with
-- RAISE 'REPORT pass=N fail=M', which undoes everything it wrote.
DO $suite$
DECLARE
  pass int := 0; fails text := ''; ok boolean;
  v_pkg uuid; v_var uuid; v_min int; v_owner uuid; t1 uuid; t2 uuid; t3 uuid; t4 uuid;
  d date := (now() AT TIME ZONE 'Asia/Manila')::date + 40;
BEGIN
  SELECT p.id, v.id, v.min_pax, o.profile_id INTO v_pkg, v_var, v_min, v_owner
    FROM tours_packages p
    JOIN tours_package_price_variants v ON v.package_id = p.id AND v.price_per_pax IS NOT NULL AND v.max_pax IS NULL
    JOIN tours_operators o ON o.id = p.operator_id
   WHERE p.status = 'published'
     AND NOT EXISTS (SELECT 1 FROM tours_package_availability a WHERE a.package_id = p.id)
     AND NOT EXISTS (SELECT 1 FROM tours_package_resources r WHERE r.package_id = p.id)
   ORDER BY v.min_pax LIMIT 1;
  SELECT id INTO t1 FROM profiles WHERE role='tourist' ORDER BY id LIMIT 1 OFFSET 0;
  SELECT id INTO t2 FROM profiles WHERE role='tourist' ORDER BY id LIMIT 1 OFFSET 1;
  SELECT id INTO t3 FROM profiles WHERE role='tourist' ORDER BY id LIMIT 1 OFFSET 2;
  IF v_pkg IS NULL OR t3 IS NULL THEN RAISE EXCEPTION 'REPORT setup incomplete'; END IF;

  -- 1. Existing packages got the default of 20.
  IF (SELECT daily_capacity FROM tours_packages WHERE id = v_pkg) = 20 THEN pass := pass + 1; ELSE fails := fails || 'default not 20; '; END IF;

  -- Cap the package so two minimum bookings fit and a third does not.
  UPDATE tours_packages SET daily_capacity = v_min * 2 WHERE id = v_pkg;
  INSERT INTO tours_bookings (package_id,user_id,price_variant_id,tour_date,number_of_pax,contact_name,contact_email,contact_phone,booking_reference)
  VALUES (v_pkg,t1,v_var,d,v_min,'Cap','cap1@example.invalid','09171234567','BK-CAP-1'),
         (v_pkg,t2,v_var,d,v_min,'Cap','cap2@example.invalid','09171234567','BK-CAP-2');

  -- 2. A booking past the cap is refused.
  BEGIN
    INSERT INTO tours_bookings (package_id,user_id,price_variant_id,tour_date,number_of_pax,contact_name,contact_email,contact_phone,booking_reference)
    VALUES (v_pkg,t3,v_var,d,v_min,'Cap','cap3@example.invalid','09171234567','BK-CAP-3');
    ok := false;
  EXCEPTION WHEN check_violation THEN ok := SQLERRM ILIKE '%fully booked%';
  END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'over-cap booking accepted; '; END IF;

  -- 3. Another day still has its own seats.
  INSERT INTO tours_bookings (package_id,user_id,price_variant_id,tour_date,number_of_pax,contact_name,contact_email,contact_phone,booking_reference)
  VALUES (v_pkg,t3,v_var,d + 1,v_min,'Cap','cap4@example.invalid','09171234567','BK-CAP-4');
  pass := pass + 1;

  -- 4. Operators set the cap through the RPC; out-of-range values are refused.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  PERFORM tours_set_daily_capacity(v_pkg, 35);
  BEGIN PERFORM tours_set_daily_capacity(v_pkg, 0); ok := false;
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF ok AND (SELECT daily_capacity FROM tours_packages WHERE id = v_pkg) = 35 THEN pass := pass + 1; ELSE fails := fails || 'owner RPC; '; END IF;

  -- 5. A stranger cannot change it.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', t1, 'role', 'authenticated')::text, true);
  BEGIN PERFORM tours_set_daily_capacity(v_pkg, 99); ok := false;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'stranger changed cap; '; END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);

  RAISE EXCEPTION 'REPORT pass=% fail=% [%]', pass, (length(fails) - length(replace(fails, ';', ''))), fails;
END;
$suite$;
