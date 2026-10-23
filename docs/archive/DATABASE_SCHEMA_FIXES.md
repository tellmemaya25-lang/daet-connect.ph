# Database Schema Issues & Fixes

## Summary of Issues Found

### 1. ✅ **Fixed: tours_package_stops column names**
- Code expected: `stop_name`, `stop_description`, `order_index`
- Database has: `location_name`, `description`, `stop_order`
- **Status:** Fixed in package detail page

### 2. ❌ **Missing Table: tours_package_inclusions**
- Code expects this table but it doesn't exist
- Needed for: Package inclusions (what's included/excluded)
- **Impact:** Package creation Step 2, Package detail page

### 3. ❌ **Missing Table: tours_package_gallery**
- Code expects this table but it doesn't exist  
- Needed for: Package photo galleries
- **Impact:** Package creation Step 3, Package detail page

### 4. ⚠️ **Column Name Mismatch: tours_operators**
- Code expects: `user_id`
- Database has: `profile_id`
- **Impact:** All operator-related queries
- **Status:** Partially fixed (SQL uses profile_id now)

## Recommended Actions

### Priority 1: Create Missing Tables

Run this SQL to create missing tables:

```sql
-- Create tours_package_inclusions table
CREATE TABLE IF NOT EXISTS tours_package_inclusions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id UUID NOT NULL REFERENCES tours_packages(id) ON DELETE CASCADE,
  item_text TEXT NOT NULL,
  is_included BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_package_inclusions_package_id ON tours_package_inclusions(package_id);

-- Create tours_package_gallery table  
CREATE TABLE IF NOT EXISTS tours_package_gallery (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id UUID NOT NULL REFERENCES tours_packages(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_package_gallery_package_id ON tours_package_gallery(package_id);
CREATE INDEX idx_package_gallery_order ON tours_package_gallery(package_id, display_order);

-- Grant permissions
GRANT ALL ON tours_package_inclusions TO authenticated;
GRANT ALL ON tours_package_gallery TO authenticated;
```

### Priority 2: Update RPC Functions

The RPC functions we created earlier use wrong column names. Need to update:

```sql
-- Fix replace_package_stops to use correct column names
CREATE OR REPLACE FUNCTION replace_package_stops(
  p_package_id UUID,
  p_stops JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify the package belongs to the current user's operator account
  IF NOT EXISTS (
    SELECT 1 FROM tours_packages tp
    JOIN tours_operators toper ON tp.operator_id = toper.id
    WHERE tp.id = p_package_id AND toper.profile_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Package not found or access denied';
  END IF;

  -- Delete existing stops
  DELETE FROM tours_package_stops
  WHERE package_id = p_package_id;

  -- Insert new stops with computed stop_order
  INSERT INTO tours_package_stops (
    package_id,
    location_name,
    description,
    latitude,
    longitude,
    stop_order
  )
  SELECT
    p_package_id,
    (v->>'location_name')::TEXT,
    (v->>'description')::TEXT,
    (v->>'latitude')::NUMERIC,
    (v->>'longitude')::NUMERIC,
    ROW_NUMBER() OVER () - 1 AS stop_order
  FROM jsonb_array_elements(p_stops) AS v;
END;
$$;
```

### Priority 3: Fix Code References

Files that need updating to use `profile_id` instead of `user_id`:

1. All operator-related queries in actions.ts files
2. Any authentication/authorization checks
3. The RPC functions (already noted above)

## Testing Checklist

After applying fixes:

- [ ] Create missing tables (inclusions, gallery)
- [ ] Update RPC functions with correct column names
- [ ] Test package creation (all 6 steps)
- [ ] Test package detail page (inclusions should show)
- [ ] Test browse page (should still work)
- [ ] Test operator dashboard

## Migration Script

See: `supabase/migrations/fix_schema_mismatches.sql`
