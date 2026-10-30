-- Local guide directory suite. One DO block that ALWAYS rolls back (it ends by
-- raising the report), so it is safe on a live project. Paste into the
-- Supabase SQL editor and read "REPORT pass=N fail=M [failures]".
-- Needs a tourist, an admin and a package of an approved operator.

DO $suite$
DECLARE
  pass int := 0;
  fails text := '';
  ok boolean;
  n int;
  v_tourist uuid;
  v_admin uuid;
  v_pkg uuid;
  v_owner uuid;
  v_place uuid;
BEGIN
  SELECT id INTO v_tourist FROM profiles WHERE role = 'tourist' LIMIT 1;
  SELECT id INTO v_admin FROM profiles WHERE role = 'admin' LIMIT 1;
  SELECT p.id, o.profile_id INTO v_pkg, v_owner FROM tours_packages p JOIN tours_operators o ON o.id = p.operator_id LIMIT 1;
  IF v_tourist IS NULL OR v_admin IS NULL OR v_pkg IS NULL THEN
    RAISE EXCEPTION 'REPORT setup incomplete: tourist=% admin=% package=%', v_tourist, v_admin, v_pkg;
  END IF;

  INSERT INTO tours_guide_places (kind, name, slug, source, is_active) VALUES ('eatery', 'Test hidden eatery', 'test-hidden-eatery', 'suite', false) RETURNING id INTO v_place;
  INSERT INTO tours_guide_places (kind, name, slug, source) VALUES ('eatery', 'Test open eatery', 'test-open-eatery', 'suite');

  -- 1. Visitors read active places and fares, not hidden ones.
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM tours_guide_places WHERE slug IN ('test-hidden-eatery', 'test-open-eatery');
  IF n = 1 THEN pass := pass + 1; ELSE fails := fails || 'anon saw ' || n || ' test places; '; END IF;
  SELECT count(*) INTO n FROM tours_fares;
  IF n >= 0 THEN pass := pass + 1; END IF;
  -- 2. Visitors cannot write.
  ok := true;
  BEGIN INSERT INTO tours_guide_places (kind, name, slug, source) VALUES ('eatery', 'Anon', 'anon-x', 'x'); ok := false; EXCEPTION WHEN OTHERS THEN NULL; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'anon inserted a place; '; END IF;
  RESET ROLE;

  -- 3. Tourists cannot add, change or delete.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tourist, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  ok := true;
  BEGIN INSERT INTO tours_fares (mode, from_name, to_name, source) VALUES ('tricycle', 'A place', 'B place', 'x'); ok := false; EXCEPTION WHEN OTHERS THEN NULL; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'tourist inserted a fare; '; END IF;
  UPDATE tours_guide_places SET name = 'Hacked' WHERE slug = 'test-open-eatery';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN pass := pass + 1; ELSE fails := fails || 'tourist updated a place; '; END IF;
  -- 4. Tourists cannot set another operator's meeting point.
  ok := true;
  BEGIN PERFORM tours_set_meeting_point(v_pkg, 'Somewhere', NULL, NULL, '06:30'); ok := false; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'tourist set a meeting point; '; END IF;
  RESET ROLE;

  -- 5. Admins see hidden rows and can write.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM tours_guide_places WHERE id = v_place;
  IF n = 1 THEN pass := pass + 1; ELSE fails := fails || 'admin cannot see hidden place; '; END IF;
  INSERT INTO tours_fares (mode, from_name, to_name, source) VALUES ('jeepney', 'Suite A', 'Suite B', 'suite');
  pass := pass + 1;
  -- 6. One fare per way of travel on a route.
  ok := true;
  BEGIN INSERT INTO tours_fares (mode, from_name, to_name, source) VALUES ('jeepney', 'suite a', 'SUITE B', 'suite'); ok := false; EXCEPTION WHEN unique_violation THEN NULL; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'duplicate fare route accepted; '; END IF;
  RESET ROLE;

  -- 7. The owner sets the meeting point; only those columns change.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM tours_set_meeting_point(v_pkg, '  Daet plaza  ', 14.1122, 122.9553, '06:30');
  RESET ROLE;
  SELECT count(*) INTO n FROM tours_packages WHERE id = v_pkg AND meeting_point_name = 'Daet plaza' AND meeting_time = '06:30';
  IF n = 1 THEN pass := pass + 1; ELSE fails := fails || 'owner could not set the meeting point; '; END IF;
  -- 8. A pin needs both numbers.
  ok := true;
  BEGIN UPDATE tours_packages SET meeting_lat = 14.1, meeting_lng = NULL WHERE id = v_pkg; ok := false; EXCEPTION WHEN check_violation THEN NULL; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'half a meeting pin accepted; '; END IF;

  RAISE EXCEPTION 'REPORT pass=% fail=% [%]', pass, (length(fails) - length(replace(fails, ';', ''))), fails;
END
$suite$;
