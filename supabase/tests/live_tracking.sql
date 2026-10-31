-- Live tour tracking rules (20261114_live_tracking.sql).
-- One DO block that ALWAYS rolls back (it ends by raising the report), so it
-- is safe on a live project. Read "REPORT pass=N fail=M [failures]".
-- Needs a confirmed booking with an approved assigned guide, plus another tourist,
-- another approved guide and another operator to act as strangers.

DO $suite$
DECLARE
  pass int := 0;
  fails text := '';
  ok boolean;
  n int;
  r jsonb;
  v_booking uuid;
  v_package uuid;
  v_tourist uuid;
  v_guide uuid;
  v_guide_id uuid;
  v_operator uuid;
  v_stranger uuid;
  v_other_guide uuid;
  v_other_operator uuid;
  v_start timestamp := (now() AT TIME ZONE 'Asia/Manila') - interval '1 hour';
  v_notes int;
  v_flare uuid;
  v_pos record;
BEGIN
  SELECT b.id, b.package_id, b.user_id, g.profile_id, o.profile_id, g.id
    INTO v_booking, v_package, v_tourist, v_guide, v_operator, v_guide_id
    FROM tours_bookings b
    JOIN tours_guides g ON g.id = b.assigned_guide_id AND g.accreditation_status = 'approved'
    JOIN tours_packages p ON p.id = b.package_id
    JOIN tours_operators o ON o.id = p.operator_id
   WHERE b.status = 'confirmed' AND b.user_id IS NOT NULL AND b.user_id <> g.profile_id AND b.user_id <> o.profile_id
   LIMIT 1;
  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'REPORT setup incomplete: no booking with an approved assigned guide';
  END IF;
  SELECT id INTO v_stranger FROM profiles WHERE id NOT IN (v_tourist, v_guide, v_operator) AND coalesce(role, 'tourist') = 'tourist' LIMIT 1;
  SELECT profile_id INTO v_other_guide FROM tours_guides WHERE accreditation_status = 'approved' AND profile_id NOT IN (v_guide, v_tourist, v_operator) LIMIT 1;
  SELECT profile_id INTO v_other_operator FROM tours_operators WHERE profile_id NOT IN (v_operator, v_tourist, v_guide) LIMIT 1;

  -- The tour runs today: met an hour ago, 4 hours long. The guide-schedule
  -- rule needs the guide marked available on the day the booking moves to.
  -- Run after 05:00 Manila time so the window-closed check can close it.
  DELETE FROM tours_guide_availability WHERE guide_id = v_guide_id AND available_date = v_start::date;
  INSERT INTO tours_guide_availability (guide_id, available_date, is_available) VALUES (v_guide_id, v_start::date, true);
  UPDATE tours_bookings SET tour_date = v_start::date WHERE id = v_booking;
  UPDATE tours_packages SET meeting_time = v_start::time, duration_type = 'hours', duration_value = 4 WHERE id = v_package;
  DELETE FROM tours_live_sessions WHERE booking_id = v_booking;
  DELETE FROM tours_live_consents WHERE booking_id = v_booking;
  DELETE FROM tours_live_positions WHERE booking_id = v_booking;
  DELETE FROM tours_live_flares WHERE booking_id = v_booking;

  SET LOCAL ROLE authenticated;

  -- 1. Only the assigned guide can start.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tourist, 'role', 'authenticated')::text, true);
  ok := true;
  BEGIN PERFORM tours_live_start(v_booking); ok := false; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'tourist started a session; '; END IF;
  IF v_other_guide IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other_guide, 'role', 'authenticated')::text, true);
    ok := true;
    BEGIN PERFORM tours_live_start(v_booking); ok := false; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    IF ok THEN pass := pass + 1; ELSE fails := fails || 'another guide started a session; '; END IF;
  END IF;

  -- 2. The guide starts and shares; a second ping within 10 s is throttled.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_guide, 'role', 'authenticated')::text, true);
  PERFORM tours_live_start(v_booking);
  r := tours_live_ping(v_booking, 14.1131, 122.9545, 12);
  IF (r->>'stored')::boolean AND r->>'precision' = 'exact' THEN pass := pass + 1; ELSE fails := fails || 'guide ping not stored: ' || r::text || '; '; END IF;
  r := tours_live_ping(v_booking, 14.1132, 122.9546, 12);
  IF r->>'reason' = 'throttled' THEN pass := pass + 1; ELSE fails := fails || 'second ping not throttled; '; END IF;

  -- 3. The tourist needs consent; with it, the live spot is stored.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tourist, 'role', 'authenticated')::text, true);
  r := tours_live_ping(v_booking, 14.1135, 122.9550, 8);
  IF r->>'reason' = 'no_consent' THEN pass := pass + 1; ELSE fails := fails || 'tourist ping without consent: ' || r::text || '; '; END IF;
  PERFORM tours_live_set_consent(v_booking, false, true);
  r := tours_live_ping(v_booking, 14.1135, 122.9550, 8);
  IF (r->>'stored')::boolean AND r->>'precision' = 'exact' THEN pass := pass + 1; ELSE fails := fails || 'tourist ping with consent: ' || r::text || '; '; END IF;
  SELECT count(*) INTO n FROM tours_live_positions WHERE booking_id = v_booking;
  IF n = 2 THEN pass := pass + 1; ELSE fails := fails || 'tourist sees ' || n || ' positions, expected own + guide; '; END IF;

  -- 4. Strangers, other guides and other operators see nothing and can't ping.
  IF v_stranger IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO n FROM tours_live_positions WHERE booking_id = v_booking;
    IF n = 0 THEN pass := pass + 1; ELSE fails := fails || 'stranger read positions; '; END IF;
    ok := true;
    BEGIN PERFORM tours_live_ping(v_booking, 14.1, 122.9, 5); ok := false; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    IF ok THEN pass := pass + 1; ELSE fails := fails || 'stranger pinged; '; END IF;
    ok := true;
    BEGIN PERFORM tours_live_flare(v_booking, 14.1, 122.9, 5); ok := false; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    IF ok THEN pass := pass + 1; ELSE fails := fails || 'stranger sent a flare; '; END IF;
    IF NOT tours_realtime_live_allowed('tour-live:' || v_booking) THEN pass := pass + 1; ELSE fails := fails || 'stranger allowed on the live channel; '; END IF;
  END IF;
  IF v_other_operator IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other_operator, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO n FROM tours_live_positions WHERE booking_id = v_booking;
    IF n = 0 THEN pass := pass + 1; ELSE fails := fails || 'other operator read positions; '; END IF;
  END IF;

  -- 5. The booking's operator sees both; the tourist may join the live channel.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_operator, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO n FROM tours_live_positions WHERE booking_id = v_booking;
  IF n = 2 THEN pass := pass + 1; ELSE fails := fails || 'operator sees ' || n || ' positions; '; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tourist, 'role', 'authenticated')::text, true);
  IF tours_realtime_live_allowed('tour-live:' || v_booking) THEN pass := pass + 1; ELSE fails := fails || 'tourist refused on the live channel; '; END IF;

  -- 6. No direct writes, even to your own row.
  BEGIN
    UPDATE tours_live_positions SET lat = 0 WHERE booking_id = v_booking;
    fails := fails || 'direct update of positions; ';
  EXCEPTION WHEN insufficient_privilege THEN pass := pass + 1; END;
  BEGIN
    INSERT INTO tours_live_positions (booking_id, profile_id, role, lat, lng, precision) VALUES (v_booking, v_tourist, 'guide', 1, 1, 'exact');
    fails := fails || 'direct insert of a position; ';
  EXCEPTION WHEN insufficient_privilege THEN pass := pass + 1; END;

  -- 7. Stopping sharing deletes the tourist's position.
  PERFORM tours_live_set_consent(v_booking, false, false);
  SELECT count(*) INTO n FROM tours_live_positions WHERE booking_id = v_booking AND profile_id = v_tourist;
  IF n = 0 THEN pass := pass + 1; ELSE fails := fails || 'position kept after consent withdrawn; '; END IF;

  -- 8. "I'm separated" works without sharing, notifies the guide, and repeats return the same alert.
  RESET ROLE;
  SELECT count(*) INTO v_notes FROM tours_notifications WHERE profile_id = v_guide AND type = 'live_separated';
  SET LOCAL ROLE authenticated;
  v_flare := (tours_live_flare(v_booking, 14.1300, 122.9900, 20)).id;
  IF v_flare = (tours_live_flare(v_booking, 14.1301, 122.9901, 20)).id THEN pass := pass + 1; ELSE fails := fails || 'repeat flare made a new alert; '; END IF;
  RESET ROLE;
  SELECT count(*) INTO n FROM tours_notifications WHERE profile_id = v_guide AND type = 'live_separated';
  IF n = v_notes + 1 THEN pass := pass + 1; ELSE fails := fails || 'guide not notified once of the flare; '; END IF;
  SET LOCAL ROLE authenticated;

  -- 9. Only the guide/operator can end; ending deletes positions and flares.
  ok := true;
  BEGIN PERFORM tours_live_end(v_booking); ok := false; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'tourist ended the session; '; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_guide, 'role', 'authenticated')::text, true);
  PERFORM tours_live_end(v_booking);
  RESET ROLE;
  SELECT count(*) INTO n FROM (SELECT 1 FROM tours_live_positions WHERE booking_id = v_booking UNION ALL SELECT 1 FROM tours_live_flares WHERE booking_id = v_booking) x;
  IF n = 0 THEN pass := pass + 1; ELSE fails := fails || 'locations kept after the session ended; '; END IF;
  SET LOCAL ROLE authenticated;

  -- 10. Trip sharing (no session running) stores only the nearest town.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tourist, 'role', 'authenticated')::text, true);
  PERFORM tours_live_set_consent(v_booking, true, false);
  r := tours_live_ping(v_booking, 13.9500, 122.1200, 15);
  SELECT lat, lng, place_name, accuracy_m INTO v_pos FROM tours_live_positions WHERE booking_id = v_booking AND profile_id = v_tourist;
  IF r->>'precision' = 'town' AND v_pos.place_name = 'Gumaca' AND v_pos.lat = 13.921 AND v_pos.accuracy_m IS NULL THEN pass := pass + 1; ELSE fails := fails || 'trip ping not snapped to the town: ' || r::text || '; '; END IF;

  -- 11. After the tour window closes, pings are refused and locations deleted.
  RESET ROLE;
  -- Close the window without moving the date (the guide may have another tour then):
  -- a 1-hour tour that met at midnight closed at 04:00 today.
  UPDATE tours_packages SET meeting_time = time '00:00', duration_value = 1 WHERE id = v_package;
  SET LOCAL ROLE authenticated;
  r := tours_live_ping(v_booking, 13.9500, 122.1200, 15);
  RESET ROLE;
  SELECT count(*) INTO n FROM tours_live_positions WHERE booking_id = v_booking;
  IF r->>'reason' = 'closed' AND n = 0 THEN pass := pass + 1; ELSE fails := fails || 'ping after the tour: ' || r::text || ', rows ' || n || '; '; END IF;

  -- 12. Visitors who aren't signed in can't call it at all.
  SET LOCAL ROLE anon;
  ok := true;
  BEGIN PERFORM tours_live_ping(v_booking, 14.1, 122.9, 5); ok := false; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'anon called tours_live_ping; '; END IF;
  RESET ROLE;

  RAISE EXCEPTION 'REPORT pass=% fail=% %', pass, CASE WHEN fails = '' THEN 0 ELSE array_length(string_to_array(trim(trailing '; ' FROM fails), '; '), 1) END, fails;
END;
$suite$;
