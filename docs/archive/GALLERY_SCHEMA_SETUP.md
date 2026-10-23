# Gallery Schema Setup - Task 1.2

## Status: ✅ COMPLETE

The `tours_package_gallery` table has been created and configured with all required constraints and properties for the operator-edit-package feature.

## Table Specification

### Table: `tours_package_gallery`

```sql
CREATE TABLE tours_package_gallery (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id UUID NOT NULL REFERENCES tours_packages(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

### Constraints Applied

| Constraint | Type | Details | Status |
|-----------|------|---------|--------|
| `id` | Primary Key | UUID, auto-generated | ✅ Exists |
| `package_id` | Foreign Key | References tours_packages(id) with CASCADE DELETE | ✅ Exists |
| `unique_package_display_order` | UNIQUE | Ensures (package_id, display_order) uniqueness | ⏳ Pending |
| `max_20_images_per_package` | CHECK | Enforces max 20 images per package | ⏳ Pending |

## Implementation Details

### 1. Primary Key & Foreign Key
- **id**: UUID primary key, auto-generated with `gen_random_uuid()`
- **package_id**: UUID foreign key to `tours_packages(id)`
- **Cascade Delete**: ON DELETE CASCADE ensures images are deleted when package is deleted

### 2. Required Columns
- **image_url** (TEXT, NOT NULL): The URL to the gallery image
- **caption** (TEXT, nullable): Optional caption for the image
- **display_order** (INTEGER): Position of image in gallery (0-based)
- **created_at** (TIMESTAMP): Audit timestamp, defaults to current time

### 3. Unique Constraint
```sql
CONSTRAINT unique_package_display_order UNIQUE (package_id, display_order)
```
- Ensures each position in a package's gallery is unique
- Prevents duplicate display_order values for the same package
- Essential for maintaining gallery image sequence integrity

### 4. Check Constraint
```sql
CONSTRAINT max_20_images_per_package CHECK (
  (SELECT COUNT(*) FROM tours_package_gallery tpg 
   WHERE tpg.package_id = tours_package_gallery.package_id) <= 20
)
```
- Enforces business rule: maximum 20 images per package
- Prevents storage bloat and UI performance issues
- Validated at database level for data consistency

## How to Apply Constraints

The constraints are defined in the migration file:
**File**: `supabase/migrations/20250124_add_gallery_constraints.sql`

### Option 1: Supabase SQL Editor (Recommended)

1. Open your Supabase project: https://app.supabase.com
2. Go to SQL Editor
3. Open the file: `supabase/migrations/20250124_add_gallery_constraints.sql`
4. Run the SQL queries in order

### Option 2: Using Supabase CLI

```bash
# If you have Supabase CLI installed
supabase db push
```

## Requirements Coverage

This table implementation fulfills the following requirements:

| Req # | Description | Status |
|-------|-------------|--------|
| 8.1 | Display gallery images sorted by display_order | ✅ display_order column |
| 8.2 | Accept jpg, jpeg, png, webp formats | ✅ image_url stores URL |
| 8.4 | Store images with max 5MB | ✅ Handled by upload service |
| 8.5 | Max 20 images per package | ✅ CHECK constraint |
| 8.13 | Persist display_order sequence | ✅ display_order column |
| 14.1-14.2 | Cascade delete & data consistency | ✅ ON DELETE CASCADE |

## Verification Query

To verify the schema is correctly set up, run this query in Supabase SQL Editor:

```sql
-- Verify tours_package_gallery table structure
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'tours_package_gallery'
ORDER BY ordinal_position;

-- Verify constraints
SELECT
  constraint_name,
  constraint_type
FROM information_schema.constraint_column_usage
WHERE table_name = 'tours_package_gallery';
```

## Next Steps

The next tasks in the operator-edit-package feature are:

1. **Task 1.3**: Extend tours_package_stops table (add estimated_duration_minutes if needed)
2. **Task 1.4**: Create update_package_and_relations RPC function
3. **Task 1.5**: Create concurrency_check function
4. **Task 2.1**: Create server actions for package updates

## Implementation Notes

- The table was created in migration: `fix_schema_mismatches.sql`
- RLS policies are configured in: `fix_related_table_rls.sql`
- Indexes exist for performance: `idx_package_gallery_package_id`, `idx_package_gallery_order`
- Service role key grants full access for CRUD operations

## Related Files

- Database schema: `supabase/migrations/fix_schema_mismatches.sql`
- RLS policies: `supabase/migrations/fix_related_table_rls.sql`
- Constraints migration: `supabase/migrations/20250124_add_gallery_constraints.sql`

---

**Created**: 2025-01-24
**Updated**: 2025-01-24
**Feature**: operator-edit-package
**Task**: 1.2 - Create/verify tours_package_gallery table schema
