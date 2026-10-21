-- ================================================================
-- CREATE UPDATE_PACKAGE_AND_RELATIONS RPC FUNCTION
-- Performs atomic multi-table updates for package editing
-- ================================================================

-- Step 1: Verify tables exist for inclusions and gallery
-- ================================================================
CREATE TABLE IF NOT EXISTS tours_package_inclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES tours_packages(id) ON DELETE CASCADE,
  item_text TEXT NOT NULL,
  is_included BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT valid_item_text CHECK (
    item_text IS NOT NULL AND 
    length(trim(item_text)) >= 1 AND 
    length(item_text) <= 500
  ),
  
  CONSTRAINT unique_display_order UNIQUE (package_id, display_order)
);

CREATE INDEX IF NOT EXISTS idx_inclusions_package ON tours_package_inclusions(package_id);

-- Enable RLS
ALTER TABLE tours_package_inclusions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view inclusions for packages they access
CREATE POLICY "Users can view package inclusions"
  ON tours_package_inclusions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tours_packages tp
      WHERE tp.id = package_id
      AND (
        tp.status = 'published'
        OR tp.operator_id = (
          SELECT id FROM tours_operators
          WHERE user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
        )
      )
    )
  );

-- RLS Policy: Operators can modify inclusions for their packages
CREATE POLICY "Operators can modify package inclusions"
  ON tours_package_inclusions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tours_packages tp
      JOIN tours_operators toper ON tp.operator_id = toper.id
      WHERE tp.id = package_id
      AND toper.user_id = auth.uid()
    )
  );

COMMENT ON TABLE tours_package_inclusions IS 'Inclusions and exclusions for tour packages';
COMMENT ON COLUMN tours_package_inclusions.is_included IS 'True for inclusions, False for exclusions';
COMMENT ON COLUMN tours_package_inclusions.display_order IS 'Order in which items are displayed';


-- Step 2: Create gallery table if not exists
-- ================================================================
CREATE TABLE IF NOT EXISTS tours_package_gallery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES tours_packages(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT valid_image_url CHECK (
    image_url IS NOT NULL AND 
    length(trim(image_url)) > 0
  ),
  
  CONSTRAINT valid_caption CHECK (
    caption IS NULL OR 
    (length(caption) >= 0 AND length(caption) <= 500)
  ),
  
  CONSTRAINT unique_display_order_gallery UNIQUE (package_id, display_order)
);

CREATE INDEX IF NOT EXISTS idx_gallery_package ON tours_package_gallery(package_id);

-- Add check constraint for max 20 images per package
ALTER TABLE tours_package_gallery
ADD CONSTRAINT max_images_per_package CHECK (
  (SELECT COUNT(*) FROM tours_package_gallery tg WHERE tg.package_id = package_id) <= 20
);

-- Enable RLS
ALTER TABLE tours_package_gallery ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view gallery for packages they access
CREATE POLICY "Users can view package gallery"
  ON tours_package_gallery
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tours_packages tp
      WHERE tp.id = package_id
      AND (
        tp.status = 'published'
        OR tp.operator_id = (
          SELECT id FROM tours_operators
          WHERE user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
        )
      )
    )
  );

-- RLS Policy: Operators can modify gallery for their packages
CREATE POLICY "Operators can modify package gallery"
  ON tours_package_gallery
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tours_packages tp
      JOIN tours_operators toper ON tp.operator_id = toper.id
      WHERE tp.id = package_id
      AND toper.user_id = auth.uid()
    )
  );

COMMENT ON TABLE tours_package_gallery IS 'Gallery images for tour packages';
COMMENT ON COLUMN tours_package_gallery.caption IS 'Optional caption for the image';
COMMENT ON COLUMN tours_package_gallery.display_order IS 'Order in which images are displayed in the gallery';


-- Step 3: Create the main RPC function
-- ================================================================
CREATE OR REPLACE FUNCTION update_package_and_relations(
  p_package_id UUID,
  p_package_data JSONB,
  p_price_variants JSONB,
  p_inclusions JSONB,
  p_stops JSONB,
  p_gallery JSONB
)
RETURNS TABLE(
  success BOOLEAN,
  updated_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
  v_updated_at TIMESTAMPTZ;
  v_operator_id UUID;
  v_current_status TEXT;
  v_error_message TEXT;
BEGIN
  -- Verify the authenticated user is the package owner (operator)
  SELECT tp.operator_id, tp.status INTO v_operator_id, v_current_status
  FROM tours_packages tp
  JOIN tours_operators toper ON tp.operator_id = toper.id
  WHERE tp.id = p_package_id AND toper.user_id = auth.uid();

  IF v_operator_id IS NULL THEN
    RAISE EXCEPTION 'Package not found or access denied';
  END IF;

  -- Begin transaction - all operations should succeed or all rollback
  BEGIN
    -- Step 1: Update tours_packages core fields
    UPDATE tours_packages
    SET
      title = COALESCE((p_package_data->>'title')::TEXT, title),
      location_name = COALESCE((p_package_data->>'location_name')::TEXT, location_name),
      description = COALESCE((p_package_data->>'description')::TEXT, description),
      duration_value = COALESCE((p_package_data->>'duration_value')::NUMERIC, duration_value),
      duration_type = COALESCE((p_package_data->>'duration_type')::TEXT, duration_type),
      cover_image_url = (p_package_data->>'cover_image_url')::TEXT,
      updated_at = now()
    WHERE id = p_package_id
    RETURNING updated_at INTO v_updated_at;

    -- Step 2: Delete all existing price variants and insert new ones
    DELETE FROM tours_package_price_variants
    WHERE package_id = p_package_id;

    INSERT INTO tours_package_price_variants (
      package_id,
      variant_name,
      price_per_pax,
      flat_price,
      min_pax,
      max_pax,
      is_default
    )
    SELECT
      p_package_id,
      (v->>'variant_name')::TEXT,
      NULLIF((v->>'price_per_pax')::TEXT, '')::NUMERIC,
      NULLIF((v->>'flat_price')::TEXT, '')::NUMERIC,
      (v->>'min_pax')::INTEGER,
      (v->>'max_pax')::INTEGER,
      COALESCE((v->>'is_default')::BOOLEAN, false)
    FROM jsonb_array_elements(p_price_variants) AS v
    WHERE (v->>'variant_name')::TEXT IS NOT NULL;

    -- Step 3: Delete all existing inclusions and insert new ones with display_order preservation
    DELETE FROM tours_package_inclusions
    WHERE package_id = p_package_id;

    INSERT INTO tours_package_inclusions (
      package_id,
      item_text,
      is_included,
      display_order
    )
    SELECT
      p_package_id,
      (v->>'item_text')::TEXT,
      (v->>'is_included')::BOOLEAN,
      (v->>'display_order')::INTEGER
    FROM jsonb_array_elements(p_inclusions) AS v
    WHERE (v->>'item_text')::TEXT IS NOT NULL;

    -- Step 4: Delete all existing stops and insert new ones with stop_order recomputation
    DELETE FROM tours_package_stops
    WHERE package_id = p_package_id;

    INSERT INTO tours_package_stops (
      package_id,
      stop_name,
      stop_description,
      latitude,
      longitude,
      order_index
    )
    SELECT
      p_package_id,
      (v->>'stop_name')::TEXT,
      (v->>'stop_description')::TEXT,
      (v->>'latitude')::NUMERIC,
      (v->>'longitude')::NUMERIC,
      ROW_NUMBER() OVER (ORDER BY (v->>'display_order')::INTEGER) - 1
    FROM jsonb_array_elements(p_stops) AS v
    WHERE (v->>'stop_name')::TEXT IS NOT NULL;

    -- Step 5: Delete all existing gallery images and insert new ones with display_order preservation
    DELETE FROM tours_package_gallery
    WHERE package_id = p_package_id;

    INSERT INTO tours_package_gallery (
      package_id,
      image_url,
      caption,
      display_order
    )
    SELECT
      p_package_id,
      (v->>'image_url')::TEXT,
      (v->>'caption')::TEXT,
      (v->>'display_order')::INTEGER
    FROM jsonb_array_elements(p_gallery) AS v
    WHERE (v->>'image_url')::TEXT IS NOT NULL;

    -- Return success with updated_at timestamp
    RETURN QUERY SELECT true::BOOLEAN, v_updated_at;

  EXCEPTION WHEN OTHERS THEN
    -- If any operation fails, rollback the entire transaction and return failure
    v_error_message := SQLERRM;
    RAISE LOG 'update_package_and_relations failed: %', v_error_message;
    RETURN QUERY SELECT false::BOOLEAN, NULL::TIMESTAMP WITH TIME ZONE;
  END;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_package_and_relations(UUID, JSONB, JSONB, JSONB, JSONB, JSONB) TO authenticated;

COMMENT ON FUNCTION update_package_and_relations(UUID, JSONB, JSONB, JSONB, JSONB, JSONB) IS 
'Atomically updates a package and all its related tables (variants, inclusions, stops, gallery) in a single transaction';


-- Step 4: Create concurrency_check function for timestamp-based conflict detection
-- ================================================================
CREATE OR REPLACE FUNCTION concurrency_check(
  p_package_id UUID,
  p_cached_updated_at TIMESTAMPTZ
)
RETURNS TABLE(
  has_conflict BOOLEAN,
  current_updated_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
  v_current_updated_at TIMESTAMPTZ;
BEGIN
  SELECT updated_at INTO v_current_updated_at
  FROM tours_packages
  WHERE id = p_package_id;

  -- Compare cached timestamp with current database timestamp
  RETURN QUERY SELECT
    (v_current_updated_at IS NOT NULL AND v_current_updated_at > p_cached_updated_at)::BOOLEAN,
    v_current_updated_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION concurrency_check(UUID, TIMESTAMPTZ) TO authenticated;

COMMENT ON FUNCTION concurrency_check(UUID, TIMESTAMPTZ) IS 
'Detects concurrent modifications by comparing cached updated_at with current database value. Returns conflict flag and current timestamp.';


-- ================================================================
-- MIGRATION COMPLETE
-- ================================================================
-- The following functions are now available:
-- - update_package_and_relations() - Atomic multi-table updates
-- - concurrency_check() - Timestamp-based conflict detection
-- ================================================================
