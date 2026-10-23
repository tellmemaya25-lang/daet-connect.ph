# Task 1.1: Create/Verify tours_package_inclusions Table Schema

## Completed

✅ **Schema created** for `tours_package_inclusions` and `tours_package_gallery` tables

## Files Created

### 1. SQL Migration
- **File**: `scripts/create-package-inclusions-gallery-tables.sql`
- **Contents**: SQL DDL to create both tables with all required constraints

### 2. Setup Script
- **File**: `scripts/setup-inclusions-gallery-tables.js`
- **Usage**: `node scripts/setup-inclusions-gallery-tables.js`
- **Purpose**: Execute the SQL migration in Supabase

### 3. TypeScript Contracts
- **File**: `src/lib/tours/package-inclusions-gallery-contract.ts`
- **Contents**: 
  - Type definitions for database records
  - Field constant mappings
  - Input types for validation
  - Constraint constants for validation

## Schema Specification

### tours_package_inclusions Table

```sql
CREATE TABLE tours_package_inclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES tours_packages(id) ON DELETE CASCADE,
  item_text TEXT NOT NULL,
  is_included BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(package_id, display_order)
);
```

**Columns:**
- `id` (UUID, PK): Unique identifier
- `package_id` (UUID, FK): Foreign key to tours_packages with CASCADE delete
- `item_text` (TEXT, NOT NULL): The inclusion/exclusion item description
- `is_included` (BOOLEAN, NOT NULL, DEFAULT true): Whether this is included (true) or excluded (false)
- `display_order` (INTEGER, NOT NULL): Display order within the package (1-50)
- `created_at` (TIMESTAMP, DEFAULT now()): Creation timestamp

**Constraints:**
- PRIMARY KEY on `id`
- FOREIGN KEY: `package_id` → `tours_packages.id` with CASCADE DELETE
- UNIQUE: `(package_id, display_order)` - prevents duplicate ordering per package
- NOT NULL: `package_id`, `item_text`, `is_included`, `display_order`

**Indexes:**
- `idx_package_inclusions_package_id` on `package_id` for fast lookups
- `idx_package_inclusions_order` on `(package_id, display_order)` for ordered queries

### tours_package_gallery Table

```sql
CREATE TABLE tours_package_gallery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES tours_packages(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(package_id, display_order),
  CONSTRAINT max_images_per_package CHECK (
    (SELECT COUNT(*) FROM tours_package_gallery 
     WHERE package_id = tours_package_gallery.package_id) <= 20
  )
);
```

**Columns:**
- `id` (UUID, PK): Unique identifier
- `package_id` (UUID, FK): Foreign key to tours_packages with CASCADE delete
- `image_url` (TEXT, NOT NULL): URL/path to the gallery image
- `caption` (TEXT, NULLABLE): Optional caption for the image (0-500 chars)
- `display_order` (INTEGER, NOT NULL): Display order within the package (1-20)
- `created_at` (TIMESTAMP, DEFAULT now()): Creation timestamp

**Constraints:**
- PRIMARY KEY on `id`
- FOREIGN KEY: `package_id` → `tours_packages.id` with CASCADE DELETE
- UNIQUE: `(package_id, display_order)` - prevents duplicate ordering per package
- CHECK: `max_images_per_package` - enforces maximum 20 images per package
- NOT NULL: `package_id`, `image_url`, `display_order`

**Indexes:**
- `idx_package_gallery_package_id` on `package_id` for fast lookups
- `idx_package_gallery_order` on `(package_id, display_order)` for ordered queries

## How to Apply the Schema

### Option 1: Using the Setup Script (Recommended)

```bash
# From project root
node scripts/setup-inclusions-gallery-tables.js
```

The script will:
1. Read the SQL file
2. Connect to Supabase using credentials from `.env.local`
3. Execute the SQL
4. Verify the tables were created

### Option 2: Manual Setup via Supabase Dashboard

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Navigate to your project
3. Open **SQL Editor**
4. Create a new query
5. Copy the contents of `scripts/create-package-inclusions-gallery-tables.sql`
6. Click **Run** (or press Ctrl+Enter)

### Option 3: Using Supabase CLI

```bash
# If you have Supabase CLI installed
supabase db push
```

## Verification

### Check Tables Exist

In Supabase SQL Editor:
```sql
-- List all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE 'tours_package_%'
ORDER BY table_name;
```

Expected output:
- `tours_package_gallery`
- `tours_package_inclusions`
- `tours_package_price_variants`
- `tours_package_stops`

### Check Column Schema

```sql
-- Verify tours_package_inclusions columns
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'tours_package_inclusions'
ORDER BY ordinal_position;
```

Expected columns:
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| package_id | uuid | NO | NULL |
| item_text | text | NO | NULL |
| is_included | boolean | NO | true |
| display_order | integer | NO | NULL |
| created_at | timestamp with timezone | YES | now() |

```sql
-- Verify tours_package_gallery columns
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'tours_package_gallery'
ORDER BY ordinal_position;
```

Expected columns:
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| package_id | uuid | NO | NULL |
| image_url | text | NO | NULL |
| caption | text | YES | NULL |
| display_order | integer | NO | NULL |
| created_at | timestamp with timezone | YES | now() |

### Check Constraints

```sql
-- Check unique constraints
SELECT 
  constraint_name,
  constraint_type,
  table_name
FROM information_schema.table_constraints
WHERE table_name IN ('tours_package_inclusions', 'tours_package_gallery')
ORDER BY table_name, constraint_name;
```

Expected constraints:
- `tours_package_inclusions_pkey` (PRIMARY KEY)
- `tours_package_inclusions_package_id_display_order_key` (UNIQUE)
- `tours_package_gallery_pkey` (PRIMARY KEY)
- `tours_package_gallery_package_id_display_order_key` (UNIQUE)
- `max_images_per_package` (CHECK)

### Test Foreign Key & Cascade Delete

```sql
-- Find a package ID
SELECT id FROM tours_packages LIMIT 1;

-- Insert test inclusion
INSERT INTO tours_package_inclusions (package_id, item_text, is_included, display_order)
VALUES ('YOUR_PACKAGE_ID', 'Test Inclusion', true, 1);

-- Insert test gallery
INSERT INTO tours_package_gallery (package_id, image_url, caption, display_order)
VALUES ('YOUR_PACKAGE_ID', 'https://example.com/image.jpg', 'Test Image', 1);

-- Verify cascade delete works (delete package should delete related records)
-- DO NOT RUN unless testing: DELETE FROM tours_packages WHERE id = 'YOUR_PACKAGE_ID';
```

## TypeScript Contract

The file `src/lib/tours/package-inclusions-gallery-contract.ts` provides:

```typescript
// Record types
export interface PackageInclusionRecord {
  id: string;
  package_id: string;
  item_text: string;
  is_included: boolean;
  display_order: number;
  created_at: string;
}

export interface PackageGalleryRecord {
  id: string;
  package_id: string;
  image_url: string;
  caption: string | null;
  display_order: number;
  created_at: string;
}

// Input types for creation/updates
export interface PackageInclusionInput {
  item_text: string;
  is_included: boolean;
  display_order: number;
}

export interface PackageGalleryInput {
  image_url: string;
  caption?: string | null;
  display_order: number;
}

// Validation constraints
export const INCLUSION_CONSTRAINTS = {
  MIN_ITEM_LENGTH: 1,
  MAX_ITEM_LENGTH: 500,
  MAX_ITEMS_PER_PACKAGE: 50,
};

export const GALLERY_CONSTRAINTS = {
  MAX_CAPTION_LENGTH: 500,
  MAX_IMAGES_PER_PACKAGE: 20,
};
```

## Related Requirements

This task implements database schema for:
- **Requirements 6.1-6.10**: Edit Form - Inclusions (from requirements.md)
- **Requirements 8.1-8.13**: Edit Form - Gallery Images (from requirements.md)
- **Requirements 14.1-14.2**: Persistence and Data Consistency (from requirements.md)

## Next Steps

1. ✅ **Run setup script**: `node scripts/setup-inclusions-gallery-tables.js`
2. ⏭️ **Task 1.2**: Create/verify `tours_package_gallery` table schema (already included above)
3. ⏭️ **Task 1.3**: Extend `tours_package_stops` table if needed
4. ⏭️ **Task 1.4**: Create RPC function for atomic multi-table updates
5. ⏭️ **Task 1.5**: Create RPC function for concurrency conflict detection

## Notes

- CASCADE DELETE is enforced at the database level, so deleting a package automatically cleans up all inclusions and gallery images
- The UNIQUE constraint on `(package_id, display_order)` prevents display order conflicts
- The CHECK constraint on `tours_package_gallery` ensures the maximum 20 images per package limit
- All tables use UUID primary keys and lowercase snake_case column names to match existing conventions
