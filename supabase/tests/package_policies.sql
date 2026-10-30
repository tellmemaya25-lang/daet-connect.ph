-- Tour package rules: operators write drafts directly; everything else goes
-- through update_package_and_relations / submit_package_for_review.
-- One DO block that ALWAYS rolls back (it ends by raising the report), so it
-- is safe on a live project. Paste into the Supabase SQL editor and read
-- "REPORT pass=N fail=M [failures]". Needs an approved operator who owns a
-- published package.

DO $suite$
DECLARE
  pass int := 0;
  fails text := '';
  ok boolean;
  n int;
  v_profile uuid;
  v_operator uuid;
  v_published uuid;
  v_title text;
  v_draft uuid;
  v_variants jsonb;
  v_res record;
BEGIN
  SELECT p.id, o.id, o.profile_id, p.title INTO v_published, v_operator, v_profile, v_title
  FROM tours_packages p JOIN tours_operators o ON o.id = p.operator_id
  WHERE p.status = 'published' AND o.accreditation_status = 'approved' LIMIT 1;
  IF v_published IS NULL THEN
    RAISE EXCEPTION 'REPORT setup incomplete: no approved operator with a published package';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('id', id, 'variant_name', variant_name, 'min_pax', min_pax,
           'max_pax', max_pax, 'price_per_pax', price_per_pax, 'flat_price', flat_price, 'is_default', is_default))
    INTO v_variants FROM tours_package_price_variants WHERE package_id = v_published;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_profile, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- 1. A published tour can't be changed directly.
  UPDATE tours_packages SET title = 'Suite: sneaky edit' WHERE id = v_published;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN pass := pass + 1; ELSE fails := fails || 'direct update of published package; '; END IF;

  -- 2. New tours can't skip review on insert.
  ok := true;
  BEGIN
    INSERT INTO tours_packages (operator_id, title, location_name, duration_value, duration_type, status)
    VALUES (v_operator, 'Suite: skip review', 'Daet', 1, 'days', 'published');
    ok := false;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'inserted a published package; '; END IF;
  ok := true;
  BEGIN
    INSERT INTO tours_packages (operator_id, title, location_name, duration_value, duration_type, status)
    VALUES (v_operator, 'Suite: skip review', 'Daet', 1, 'days', 'pending_review');
    ok := false;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'inserted a pending_review package; '; END IF;

  -- 3. Drafts: create, edit, add a price and stop, then submit.
  INSERT INTO tours_packages (operator_id, title, location_name, duration_value, duration_type, status)
  VALUES (v_operator, 'Suite: draft', 'Daet', 1, 'days', 'draft') RETURNING id INTO v_draft;
  UPDATE tours_packages SET title = 'Suite: draft edited' WHERE id = v_draft;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN pass := pass + 1; ELSE fails := fails || 'could not edit own draft; '; END IF;

  INSERT INTO tours_package_price_variants (package_id, variant_name, min_pax, price_per_pax, is_default)
  VALUES (v_draft, 'Standard', 1, 1000, true);
  INSERT INTO tours_package_stops (package_id, location_name, latitude, longitude, stop_order)
  VALUES (v_draft, 'Bagasbas Beach', 14.13, 122.98, 1);
  PERFORM submit_package_for_review(v_draft);
  SELECT count(*) INTO n FROM tours_packages WHERE id = v_draft AND status = 'pending_review';
  IF n = 1 THEN pass := pass + 1; ELSE fails := fails || 'draft not submitted for review; '; END IF;

  -- 4. Nothing changes while a tour waits for review.
  ok := true;
  BEGIN
    PERFORM update_package_and_relations(v_draft, '{"title":"x","duration_value":1}', '[{"variant_name":"S","min_pax":1,"price_per_pax":1,"is_default":true}]', '[]', '[]', '[]');
    ok := false;
  EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'edited a pending_review package; '; END IF;

  -- 5. Published: a price change is refused...
  ok := true;
  BEGIN
    PERFORM update_package_and_relations(
      v_published,
      (SELECT jsonb_build_object('title', title, 'location_name', location_name, 'duration_value', duration_value, 'duration_type', duration_type) FROM tours_packages WHERE id = v_published),
      (SELECT jsonb_agg(e || jsonb_build_object('price_per_pax', COALESCE((e->>'price_per_pax')::numeric, 0) + 1)) FROM jsonb_array_elements(v_variants) e),
      COALESCE((SELECT jsonb_agg(jsonb_build_object('item_text', item_text, 'is_included', is_included)) FROM tours_package_inclusions WHERE package_id = v_published), '[]'),
      COALESCE((SELECT jsonb_agg(jsonb_build_object('location_name', location_name, 'latitude', latitude, 'longitude', longitude)) FROM tours_package_stops WHERE package_id = v_published), '[]'),
      COALESCE((SELECT jsonb_agg(jsonb_build_object('image_url', image_url)) FROM tours_package_gallery WHERE package_id = v_published), '[]'));
    ok := false;
  EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'price changed on published package; '; END IF;

  -- 6. ...but a wording change goes through and keeps the booked variants.
  SELECT * INTO v_res FROM update_package_and_relations(
    v_published,
    (SELECT jsonb_build_object('title', 'Suite: new wording', 'location_name', location_name, 'description', description, 'duration_value', duration_value, 'duration_type', duration_type) FROM tours_packages WHERE id = v_published),
    v_variants,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('item_text', item_text, 'is_included', is_included, 'display_order', display_order)) FROM tours_package_inclusions WHERE package_id = v_published), '[]'),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('location_name', location_name, 'description', description, 'latitude', latitude, 'longitude', longitude, 'stop_order', stop_order, 'estimated_duration_minutes', estimated_duration_minutes)) FROM tours_package_stops WHERE package_id = v_published), '[]'),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('image_url', image_url, 'caption', caption, 'display_order', display_order)) FROM tours_package_gallery WHERE package_id = v_published), '[]'));
  SELECT count(*) INTO n FROM tours_package_price_variants
  WHERE package_id = v_published AND id IN (SELECT (e->>'id')::uuid FROM jsonb_array_elements(v_variants) e);
  IF v_res.success AND v_res.new_status = 'published' AND n = jsonb_array_length(v_variants)
    AND (SELECT title FROM tours_packages WHERE id = v_published) = 'Suite: new wording'
  THEN pass := pass + 1; ELSE fails := fails || 'wording edit on published package failed; '; END IF;
  RESET ROLE;

  -- 7. Visitors can't call the edit function.
  ok := true;
  SET LOCAL ROLE anon;
  BEGIN PERFORM update_package_and_relations(v_published, '{}', '[]', '[]', '[]', '[]'); ok := false;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'anon called the edit function; '; END IF;

  RAISE EXCEPTION 'REPORT pass=% fail=% [%]', pass, (length(fails) - length(replace(fails, ';', ''))), fails;
END
$suite$;
