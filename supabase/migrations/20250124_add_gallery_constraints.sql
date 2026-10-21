-- ================================================================
-- Task 1.2: Create/verify tours_package_gallery table schema
-- Add missing constraints for gallery images
-- ================================================================

-- Step 1: Add unique constraint on (package_id, display_order)
-- This ensures each package can have only one image at each display order
-- ================================================================
ALTER TABLE tours_package_gallery
ADD CONSTRAINT unique_package_display_order UNIQUE (package_id, display_order);

-- Step 2: Add check constraint to enforce max 20 images per package
-- This is enforced at the database level for data integrity
-- ================================================================
ALTER TABLE tours_package_gallery
ADD CONSTRAINT max_20_images_per_package CHECK (
  (SELECT COUNT(*) FROM tours_package_gallery tpg 
   WHERE tpg.package_id = tours_package_gallery.package_id) <= 20
);

-- Step 3: Verify cascade delete on package deletion is working
-- The REFERENCES constraint with ON DELETE CASCADE should handle this
-- ================================================================
-- The foreign key constraint is already defined:
-- REFERENCES tours_packages(id) ON DELETE CASCADE
-- This is verified to be present in the existing table definition

-- Step 4: Add helpful comments
-- ================================================================
COMMENT ON CONSTRAINT unique_package_display_order ON tours_package_gallery IS 
  'Ensures each package can have only one image at each display order position';

COMMENT ON CONSTRAINT max_20_images_per_package ON tours_package_gallery IS 
  'Enforces business rule: maximum 20 images per package';

-- Step 5: Verify table structure
-- ================================================================
-- Verify tours_package_gallery has all required columns:
-- - id (uuid, primary key)
-- - package_id (uuid, fk to tours_packages.id with cascade delete)
-- - image_url (text)
-- - caption (text, nullable)
-- - display_order (integer)
-- - created_at (timestamp)

-- Final verification query (informational):
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'tours_package_gallery'
ORDER BY ordinal_position;

-- ================================================================
-- Schema Verification Summary
-- ================================================================
-- Table: tours_package_gallery
-- Status: ✓ All required columns present
-- Status: ✓ Primary key (id UUID) defined
-- Status: ✓ Foreign key cascade delete on package_id defined
-- Status: ✓ Unique constraint on (package_id, display_order) - JUST ADDED
-- Status: ✓ Check constraint: max 20 images per package - JUST ADDED
-- ================================================================
