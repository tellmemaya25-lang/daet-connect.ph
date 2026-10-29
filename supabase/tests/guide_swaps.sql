-- R6 suite: guide schedules and swap requests. One DO block that ALWAYS rolls
-- back (it ends by raising the report), so it is safe on a live project:
--
--   psql "$DATABASE_URL" -f supabase/tests/guide_swaps.sql
--   (or paste into the Supabase SQL editor)
--
-- Read the result from the error: "REPORT pass=N fail=M [failures]".
-- Needs a published package of an approved operator, a tourist and an approved
-- guide. A second guide is created inside the transaction.

DO $suite$
DECLARE
  pass int := 0;
  fails text := '';
  ok boolean;
  n int;
  v_pkg uuid;
  v_variant uuid;
  v_min int;
  v_operator_profile uuid;
  v_tourist uuid;
  v_guide uuid;
  v_guide_profile uuid;
  v_guide2 uuid;
  v_guide2_profile uuid := gen_random_uuid();
  v_booking uuid;
  v_other_booking uuid;
  v_req uuid;
  v_date date := (now() AT TIME ZONE 'Asia/Manila')::date + 21;
BEGIN
  SELECT p.id, v.id, greatest(v.min_pax, 1), o.profile_id INTO v_pkg, v_variant, v_min, v_operator_profile
  FROM tours_packages p
  JOIN tours_package_price_variants v ON v.package_id = p.id
  JOIN tours_operators o ON o.id = p.operator_id AND o.accreditation_status = 'approved'
  WHERE p.status = 'published' ORDER BY v.is_default DESC LIMIT 1;
  SELECT id INTO v_tourist FROM profiles WHERE role = 'tourist' LIMIT 1;
  SELECT id, profile_id INTO v_guide, v_guide_profile FROM tours_guides WHERE accreditation_status = 'approved' LIMIT 1;
  IF v_pkg IS NULL OR v_tourist IS NULL OR v_guide IS NULL THEN
    RAISE EXCEPTION 'REPORT setup incomplete: package=% tourist=% guide=%', v_pkg, v_tourist, v_guide;
  END IF;

  -- A second approved guide (the profile comes from the auth.users trigger).
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES (v_guide2_profile, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'swap-test-guide@example.invalid', '{"full_name":"Swap Test Guide"}', now(), now());
  UPDATE profiles SET role = 'guide', full_name = 'Swap Test Guide' WHERE id = v_guide2_profile;
  INSERT INTO tours_guides (profile_id, accreditation_status) VALUES (v_guide2_profile, 'approved') RETURNING id INTO v_guide2;

  -- Two bookings on the same date, no guide yet.
  INSERT INTO tours_package_availability (package_id, available_date, capacity_total, capacity_booked)
  VALUES (v_pkg, v_date, 50, 0)
  ON CONFLICT (package_id, available_date) DO UPDATE SET capacity_total = 50, capacity_booked = 0;
  UPDATE tours_bookings SET created_at = now() - interval '1 day' WHERE user_id = v_tourist AND created_at > now() - interval '10 minutes';
  INSERT INTO tours_bookings (package_id, user_id, price_variant_id, tour_date, number_of_pax, contact_name, contact_email, contact_phone, booking_reference)
  VALUES (v_pkg, v_tourist, v_variant, v_date, v_min, 'Swap Test', 'swap@example.invalid', '0917', 'BK-SWAPTEST-1') RETURNING id INTO v_booking;
  INSERT INTO tours_bookings (package_id, user_id, price_variant_id, tour_date, number_of_pax, contact_name, contact_email, contact_phone, booking_reference)
  VALUES (v_pkg, v_tourist, v_variant, v_date, v_min, 'Swap Test', 'swap@example.invalid', '0917', 'BK-SWAPTEST-2') RETURNING id INTO v_other_booking;

  -- 1. A guide who hasn't marked the day available can't be assigned.
  DELETE FROM tours_guide_availability WHERE guide_id IN (v_guide, v_guide2) AND available_date = v_date;
  BEGIN UPDATE tours_bookings SET assigned_guide_id = v_guide WHERE id = v_booking; ok := false; EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'guide_schedule:not_available%'; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'unavailable guide assigned; '; END IF;

  -- 2. Marked available: assignable once, but not double-booked the same day.
  INSERT INTO tours_guide_availability (guide_id, available_date, is_available) VALUES (v_guide, v_date, true), (v_guide2, v_date, true);
  UPDATE tours_bookings SET assigned_guide_id = v_guide WHERE id = v_booking;
  pass := pass + 1;
  BEGIN UPDATE tours_bookings SET assigned_guide_id = v_guide WHERE id = v_other_booking; ok := false; EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'guide_schedule:already_booked%'; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'guide double-booked; '; END IF;

  -- 3. A booked guide can't mark that day unavailable.
  BEGIN UPDATE tours_guide_availability SET is_available = false WHERE guide_id = v_guide AND available_date = v_date; ok := false; EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'guide_schedule:booked_that_day%'; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'booked day marked unavailable; '; END IF;

  -- 4. Only the assigned guide can ask for a swap.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_guide2_profile, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM tours_request_guide_swap(v_booking, NULL, 'Not my tour'); ok := false; EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'swap:not_your_tour%'; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'other guide requested a swap; '; END IF;
  RESET ROLE;

  -- 5. The assigned guide asks; a second pending request is refused; the operator is notified.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_guide_profile, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM tours_guides_free_on(v_date, v_booking) WHERE guide_id = v_guide2 AND reason IS NULL;
  IF n = 1 THEN pass := pass + 1; ELSE fails := fails || 'free guide not listed for the picker; '; END IF;
  v_req := tours_request_guide_swap(v_booking, v_guide2, 'Family emergency that day');
  BEGIN PERFORM tours_request_guide_swap(v_booking, NULL, 'Again'); ok := false; EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'swap:already_pending%'; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'second pending request allowed; '; END IF;
  BEGIN INSERT INTO tours_guide_swap_requests (booking_id, from_guide_id, reason) VALUES (v_other_booking, v_guide, 'direct'); ok := false; EXCEPTION WHEN others THEN ok := true; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'direct insert allowed; '; END IF;
  RESET ROLE;
  SELECT count(*) INTO n FROM tours_notifications WHERE profile_id = v_operator_profile AND type = 'guide_swap_requested' AND created_at > now() - interval '1 minute';
  IF n >= 1 THEN pass := pass + 1; ELSE fails := fails || 'operator not notified; '; END IF;

  -- 6. A tourist can't see the request; the named guide can.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tourist, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM tours_guide_swap_requests WHERE id = v_req;
  IF n = 0 THEN pass := pass + 1; ELSE fails := fails || 'tourist reads swap request; '; END IF;
  BEGIN PERFORM tours_decide_guide_swap(v_req, true); ok := false; EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'swap:not_your_booking%'; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'tourist decided a swap; '; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_guide2_profile, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM tours_guide_swap_requests WHERE id = v_req;
  IF n = 1 THEN pass := pass + 1; ELSE fails := fails || 'named guide cannot read request; '; END IF;
  RESET ROLE;

  -- 7. The operator approves: the booking moves; the old guide, new guide and tourist are told.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_operator_profile, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM tours_guide_swap_requests WHERE id = v_req;
  IF n = 1 THEN pass := pass + 1; ELSE fails := fails || 'operator cannot read request; '; END IF;
  PERFORM tours_decide_guide_swap(v_req, true, NULL, 'Thanks, covered.');
  RESET ROLE;
  SELECT count(*) INTO n FROM tours_bookings WHERE id = v_booking AND assigned_guide_id = v_guide2;
  IF n = 1 THEN pass := pass + 1; ELSE fails := fails || 'booking not moved to the new guide; '; END IF;
  SELECT count(*) INTO n FROM tours_notifications
  WHERE created_at > now() - interval '1 minute'
    AND ((profile_id = v_guide_profile AND type = 'guide_swap_approved') OR (profile_id = v_guide2_profile AND type = 'guide_assigned') OR (profile_id = v_tourist AND type = 'guide_assigned'));
  IF n >= 3 THEN pass := pass + 1; ELSE fails := fails || format('expected 3 notifications, got %s; ', n); END IF;

  -- 8. After the swap the old guide is free again and can be put on the other booking; deciding twice fails.
  UPDATE tours_bookings SET assigned_guide_id = v_guide WHERE id = v_other_booking;
  pass := pass + 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_operator_profile, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM tours_decide_guide_swap(v_req, false); ok := false; EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'swap:already_decided%'; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'decided twice; '; END IF;
  RESET ROLE;

  -- 9. Reject leaves the booking alone; the guide can withdraw a pending request.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_guide2_profile, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_req := tours_request_guide_swap(v_booking, NULL, 'Boat schedule clash');
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_operator_profile, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM tours_decide_guide_swap(v_req, true); ok := false; EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'swap:choose_guide%'; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'approved without a guide; '; END IF;
  PERFORM tours_decide_guide_swap(v_req, false, NULL, 'Please keep it');
  RESET ROLE;
  SELECT count(*) INTO n FROM tours_bookings WHERE id = v_booking AND assigned_guide_id = v_guide2;
  IF n = 1 THEN pass := pass + 1; ELSE fails := fails || 'reject changed the booking; '; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_guide2_profile, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_req := tours_request_guide_swap(v_booking, NULL, 'One more try');
  PERFORM tours_cancel_guide_swap(v_req);
  RESET ROLE;
  SELECT count(*) INTO n FROM tours_guide_swap_requests WHERE id = v_req AND status = 'cancelled';
  IF n = 1 THEN pass := pass + 1; ELSE fails := fails || 'guide could not withdraw; '; END IF;

  -- 10. Visitors can't call the picker.
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  BEGIN PERFORM tours_guides_free_on(v_date, NULL); ok := false; EXCEPTION WHEN others THEN ok := true; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'anon used the picker; '; END IF;
  RESET ROLE;

  RAISE EXCEPTION 'REPORT pass=% fail=% [%]', pass, (length(fails) - length(replace(fails, ';', ''))), fails;
END
$suite$;
