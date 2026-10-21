-- ================================================================
-- FIX update_package_and_relations + concurrency_check
-- Supersedes create_update_package_and_relations_rpc.sql and
-- create_concurrency_check_function.sql.
--
-- Fixes:
--  * ownership uses tours_operators.profile_id (live schema), not user_id
--  * stops use live columns location_name / description / stop_order
--  * no ambiguous "updated_at" between OUT column and table column
--  * concurrency check happens inside the same transaction (row lock)
--  * errors are raised (transaction rolls back) instead of swallowed
--  * status rules enforced server-side (pending_review/archived blocked,
--    published limited to non-structural edits)
--  * optional atomic "submit for review" (status + rejection_reason)
--  * replaces the invalid subquery CHECK (max 20 gallery images) with a trigger
--
-- Custom SQLSTATEs (PostgREST maps PTxxx to HTTP status):
--   PT400 validation, PT403 forbidden, PT404 not found, PT409 conflict
-- ================================================================

-- ---------------------------------------------------------------
-- 1. Schema safety: inclusions.display_order + stops.estimated_duration_minutes
-- ---------------------------------------------------------------
ALTER TABLE tours_package_inclusions ADD COLUMN IF NOT EXISTS display_order INTEGER;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY package_id ORDER BY created_at, id) AS rn
  FROM tours_package_inclusions
  WHERE display_order IS NULL
)
UPDATE tours_package_inclusions i
SET display_order = o.rn + COALESCE(
  (SELECT MAX(display_order) FROM tours_package_inclusions x
   WHERE x.package_id = i.package_id AND x.display_order IS NOT NULL), 0)
FROM ordered o
WHERE i.id = o.id;

ALTER TABLE tours_package_inclusions ALTER COLUMN display_order SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'tours_package_inclusions'::regclass
      AND contype = 'u'
      AND conname IN ('unique_display_order', 'unique_inclusion_display_order')
  ) THEN
    ALTER TABLE tours_package_inclusions
      ADD CONSTRAINT unique_inclusion_display_order UNIQUE (package_id, display_order);
  END IF;
END $$;

ALTER TABLE tours_package_stops ADD COLUMN IF NOT EXISTS estimated_duration_minutes INTEGER;

-- ---------------------------------------------------------------
-- 2. Gallery max-20 limit (trigger; CHECK constraints cannot use subqueries)
-- ---------------------------------------------------------------
ALTER TABLE tours_package_gallery DROP CONSTRAINT IF EXISTS max_images_per_package;
ALTER TABLE tours_package_gallery DROP CONSTRAINT IF EXISTS max_20_images_per_package;

CREATE OR REPLACE FUNCTION enforce_package_gallery_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT COUNT(*) FROM tours_package_gallery WHERE package_id = NEW.package_id) >= 20 THEN
    RAISE EXCEPTION 'A package can have at most 20 gallery images' USING ERRCODE = 'PT400';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_package_gallery_limit ON tours_package_gallery;
CREATE TRIGGER trg_package_gallery_limit
  BEFORE INSERT ON tours_package_gallery
  FOR EACH ROW EXECUTE FUNCTION enforce_package_gallery_limit();

-- ---------------------------------------------------------------
-- 3. update_package_and_relations
-- ---------------------------------------------------------------
DROP FUNCTION IF EXISTS update_package_and_relations(UUID, JSONB, JSONB, JSONB, JSONB, JSONB);
DROP FUNCTION IF EXISTS update_package_and_relations(UUID, TIMESTAMPTZ, JSONB, JSONB, JSONB, JSONB, JSONB, BOOLEAN);

CREATE FUNCTION update_package_and_relations(
  p_package_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_package_data JSONB,
  p_price_variants JSONB,
  p_inclusions JSONB,
  p_stops JSONB,
  p_gallery JSONB,
  p_submit_for_review BOOLEAN DEFAULT false
)
RETURNS TABLE(success BOOLEAN, new_updated_at TIMESTAMPTZ, new_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_current_updated_at TIMESTAMPTZ;
  v_duration_value NUMERIC;
  v_result_updated_at TIMESTAMPTZ;
  v_result_status TEXT;
BEGIN
  -- Ownership + row lock (serializes concurrent saves of the same package)
  SELECT tp.status, tp.updated_at, tp.duration_value
    INTO v_status, v_current_updated_at, v_duration_value
  FROM tours_packages tp
  JOIN tours_operators toper ON toper.id = tp.operator_id
  WHERE tp.id = p_package_id
    AND toper.profile_id = auth.uid()
    AND toper.accreditation_status = 'approved'
  FOR UPDATE OF tp;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package not found or access denied' USING ERRCODE = 'PT404';
  END IF;

  IF v_status IN ('pending_review', 'archived') THEN
    RAISE EXCEPTION 'Package cannot be edited while status is %', v_status USING ERRCODE = 'PT403';
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Package was modified by another session' USING ERRCODE = 'PT409';
  END IF;

  IF p_submit_for_review AND v_status NOT IN ('draft', 'rejected') THEN
    RAISE EXCEPTION 'Only draft or rejected packages can be submitted for review' USING ERRCODE = 'PT403';
  END IF;

  -- Payload shape / limits
  IF jsonb_typeof(p_price_variants) <> 'array' OR jsonb_array_length(p_price_variants) = 0 THEN
    RAISE EXCEPTION 'At least one price variant is required' USING ERRCODE = 'PT400';
  END IF;
  IF (SELECT COUNT(*) FROM jsonb_array_elements(p_price_variants) v
      WHERE COALESCE((v->>'is_default')::BOOLEAN, false)) <> 1 THEN
    RAISE EXCEPTION 'Exactly one default price variant is required' USING ERRCODE = 'PT400';
  END IF;
  IF jsonb_typeof(p_inclusions) <> 'array' OR jsonb_array_length(p_inclusions) > 50 THEN
    RAISE EXCEPTION 'A package can have at most 50 inclusion items' USING ERRCODE = 'PT400';
  END IF;
  IF jsonb_typeof(p_stops) <> 'array' OR jsonb_array_length(p_stops) > 50 THEN
    RAISE EXCEPTION 'A package can have at most 50 stops' USING ERRCODE = 'PT400';
  END IF;
  IF jsonb_typeof(p_gallery) <> 'array' OR jsonb_array_length(p_gallery) > 20 THEN
    RAISE EXCEPTION 'A package can have at most 20 gallery images' USING ERRCODE = 'PT400';
  END IF;

  -- Published packages: structural changes are not allowed
  IF v_status = 'published' THEN
    IF (p_package_data->>'duration_value')::NUMERIC IS DISTINCT FROM v_duration_value
       OR jsonb_array_length(p_price_variants) <> (SELECT COUNT(*) FROM tours_package_price_variants WHERE package_id = p_package_id)
       OR jsonb_array_length(p_inclusions) <> (SELECT COUNT(*) FROM tours_package_inclusions WHERE package_id = p_package_id)
       OR jsonb_array_length(p_stops) <> (SELECT COUNT(*) FROM tours_package_stops WHERE package_id = p_package_id)
       OR jsonb_array_length(p_gallery) <> (SELECT COUNT(*) FROM tours_package_gallery WHERE package_id = p_package_id)
    THEN
      RAISE EXCEPTION 'This change is not allowed on a published package' USING ERRCODE = 'PT403';
    END IF;
  END IF;

  -- Core fields (+ optional submit)
  UPDATE tours_packages tp
  SET
    title = COALESCE(NULLIF(trim(p_package_data->>'title'), ''), tp.title),
    location_name = COALESCE(NULLIF(trim(p_package_data->>'location_name'), ''), tp.location_name),
    description = NULLIF(trim(p_package_data->>'description'), ''),
    duration_value = COALESCE((p_package_data->>'duration_value')::NUMERIC, tp.duration_value),
    duration_type = COALESCE(p_package_data->>'duration_type', tp.duration_type),
    cover_image_url = CASE
      WHEN p_package_data ? 'cover_image_url' THEN NULLIF(trim(p_package_data->>'cover_image_url'), '')
      ELSE tp.cover_image_url
    END,
    status = CASE WHEN p_submit_for_review THEN 'pending_review' ELSE tp.status END,
    rejection_reason = CASE WHEN p_submit_for_review THEN NULL ELSE tp.rejection_reason END,
    updated_at = now()
  WHERE tp.id = p_package_id
  RETURNING tp.updated_at, tp.status::TEXT INTO v_result_updated_at, v_result_status;

  -- Price variants
  DELETE FROM tours_package_price_variants WHERE package_id = p_package_id;
  INSERT INTO tours_package_price_variants (
    package_id, variant_name, min_pax, max_pax, price_per_pax, flat_price, is_default
  )
  SELECT
    p_package_id,
    trim(v->>'variant_name'),
    (v->>'min_pax')::INTEGER,
    NULLIF(v->>'max_pax', '')::INTEGER,
    NULLIF(v->>'price_per_pax', '')::NUMERIC,
    NULLIF(v->>'flat_price', '')::NUMERIC,
    COALESCE((v->>'is_default')::BOOLEAN, false)
  FROM jsonb_array_elements(p_price_variants) AS v;

  -- Inclusions (order preserved, rewritten to 1..n)
  DELETE FROM tours_package_inclusions WHERE package_id = p_package_id;
  INSERT INTO tours_package_inclusions (package_id, item_text, is_included, display_order)
  SELECT
    p_package_id,
    trim(t.v->>'item_text'),
    COALESCE((t.v->>'is_included')::BOOLEAN, true),
    ROW_NUMBER() OVER (ORDER BY (t.v->>'display_order')::INTEGER NULLS LAST, t.idx)
  FROM jsonb_array_elements(p_inclusions) WITH ORDINALITY AS t(v, idx);

  -- Stops (stop_order recomputed to 1..n)
  DELETE FROM tours_package_stops WHERE package_id = p_package_id;
  INSERT INTO tours_package_stops (
    package_id, location_name, description, latitude, longitude, estimated_duration_minutes, stop_order
  )
  SELECT
    p_package_id,
    trim(t.v->>'location_name'),
    NULLIF(trim(t.v->>'description'), ''),
    (t.v->>'latitude')::NUMERIC,
    (t.v->>'longitude')::NUMERIC,
    NULLIF(t.v->>'estimated_duration_minutes', '')::INTEGER,
    ROW_NUMBER() OVER (ORDER BY (t.v->>'stop_order')::INTEGER NULLS LAST, t.idx)
  FROM jsonb_array_elements(p_stops) WITH ORDINALITY AS t(v, idx);

  -- Gallery (order preserved, rewritten to 1..n)
  DELETE FROM tours_package_gallery WHERE package_id = p_package_id;
  INSERT INTO tours_package_gallery (package_id, image_url, caption, display_order)
  SELECT
    p_package_id,
    trim(t.v->>'image_url'),
    NULLIF(t.v->>'caption', ''),
    ROW_NUMBER() OVER (ORDER BY (t.v->>'display_order')::INTEGER NULLS LAST, t.idx)
  FROM jsonb_array_elements(p_gallery) WITH ORDINALITY AS t(v, idx);

  RETURN QUERY SELECT true, v_result_updated_at, v_result_status;
END;
$$;

GRANT EXECUTE ON FUNCTION update_package_and_relations(UUID, TIMESTAMPTZ, JSONB, JSONB, JSONB, JSONB, JSONB, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION update_package_and_relations(UUID, TIMESTAMPTZ, JSONB, JSONB, JSONB, JSONB, JSONB, BOOLEAN) IS
'Atomically updates a package and its variants, inclusions, stops and gallery. Raises PT404/PT403/PT409/PT400 on failure; the whole call rolls back.';

-- ---------------------------------------------------------------
-- 4. concurrency_check (single, consistent definition)
-- ---------------------------------------------------------------
DROP FUNCTION IF EXISTS concurrency_check(UUID, TIMESTAMPTZ);

CREATE FUNCTION concurrency_check(
  p_package_id UUID,
  p_cached_updated_at TIMESTAMPTZ
)
RETURNS TABLE(has_conflict BOOLEAN, current_updated_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current TIMESTAMPTZ;
BEGIN
  SELECT tp.updated_at INTO v_current
  FROM tours_packages tp
  JOIN tours_operators toper ON toper.id = tp.operator_id
  WHERE tp.id = p_package_id AND toper.profile_id = auth.uid();

  -- Missing package (or not owned) is treated as a conflict.
  RETURN QUERY SELECT (v_current IS NULL OR v_current IS DISTINCT FROM p_cached_updated_at), v_current;
END;
$$;

GRANT EXECUTE ON FUNCTION concurrency_check(UUID, TIMESTAMPTZ) TO authenticated;
