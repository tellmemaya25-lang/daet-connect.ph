-- ================================================================
-- VERIFY tours_package_gallery Schema
-- Run this to check the current state of the table
-- ================================================================

-- 1. Check table exists and view structure
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'tours_package_gallery'
ORDER BY ordinal_position;

-- 2. Check existing constraints
SELECT
  constraint_name,
  constraint_type,
  table_name
FROM information_schema.table_constraints
WHERE table_name = 'tours_package_gallery'
ORDER BY constraint_name;

-- 3. Check if unique constraint exists
SELECT
  constraint_name,
  table_name,
  column_name
FROM information_schema.constraint_column_usage
WHERE table_name = 'tours_package_gallery'
  AND constraint_name LIKE '%unique%'
ORDER BY constraint_name;

-- 4. Check foreign keys
SELECT
  constraint_name,
  table_name,
  column_name,
  referenced_table_name,
  referenced_column_name
FROM information_schema.referential_constraints
WHERE constraint_schema = 'public'
  AND table_name = 'tours_package_gallery';

-- 5. Check indexes
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'tours_package_gallery'
ORDER BY indexname;

-- 6. Sample data check
SELECT COUNT(*) as total_gallery_images FROM tours_package_gallery;
SELECT 
  package_id,
  COUNT(*) as image_count
FROM tours_package_gallery
GROUP BY package_id
HAVING COUNT(*) > 0
LIMIT 10;
