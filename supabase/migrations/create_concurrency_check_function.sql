-- Create concurrency_check function for timestamp-based conflict detection
-- This function detects concurrent modification conflicts by comparing
-- the cached updated_at timestamp with the current database value

CREATE OR REPLACE FUNCTION concurrency_check(
  p_package_id UUID,
  p_cached_updated_at TIMESTAMP WITH TIME ZONE
) RETURNS TABLE(
  has_conflict BOOLEAN,
  current_updated_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
  v_current_updated_at TIMESTAMP WITH TIME ZONE;
  v_has_conflict BOOLEAN;
BEGIN
  -- Query the tours_packages table for the given package_id
  SELECT updated_at INTO v_current_updated_at
  FROM tours_packages
  WHERE id = p_package_id;

  -- If package not found, return conflict detected
  IF v_current_updated_at IS NULL THEN
    RETURN QUERY SELECT true, NULL::TIMESTAMP WITH TIME ZONE;
    RETURN;
  END IF;

  -- Compare database updated_at with cached value
  -- If they don't match, there's a conflict
  v_has_conflict := (v_current_updated_at IS DISTINCT FROM p_cached_updated_at);

  -- Return the result: conflict status and current updated_at
  RETURN QUERY SELECT v_has_conflict, v_current_updated_at;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION concurrency_check(UUID, TIMESTAMP WITH TIME ZONE) TO authenticated;
