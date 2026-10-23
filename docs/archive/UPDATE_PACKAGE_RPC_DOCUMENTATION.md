# Update Package and Relations RPC Function Documentation

## Overview

The `update_package_and_relations` RPC function provides atomic, all-or-nothing updates to tour packages and their related data across multiple tables. This function is the cornerstone of the operator edit package feature, ensuring data consistency and integrity.

## Function Signature

```sql
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
)
```

## Parameters

### p_package_id (UUID)
The unique identifier of the package to update.

### p_package_data (JSONB)
Core package fields to update. Must contain:
- `title` (string, 3-150 chars)
- `location_name` (string, 2-100 chars)
- `description` (string, 10-3000 chars or null)
- `duration_value` (numeric, 0.5-365)
- `duration_type` (string, "hours" or "days")
- `cover_image_url` (string or null)

Example:
```json
{
  "title": "Mekong Delta Adventure",
  "location_name": "Can Tho, Vietnam",
  "description": "A full-day tour of the Mekong Delta...",
  "duration_value": 8,
  "duration_type": "hours",
  "cover_image_url": "https://example.com/image.jpg"
}
```

### p_price_variants (JSONB Array)
Array of pricing options for the package. Each variant must contain:
- `variant_name` (string, 1-100 chars)
- `min_pax` (integer, 1-10,000)
- `max_pax` (integer, 1-10,000, >= min_pax)
- `price_per_pax` (numeric, 0.01-999,999.99 or null)
- `flat_price` (numeric, 0.01-999,999.99 or null)
- `is_default` (boolean)

At least one variant must exist. Exactly one variant must have `is_default = true`.

Example:
```json
[
  {
    "variant_name": "Budget",
    "min_pax": 1,
    "max_pax": 5,
    "price_per_pax": 50,
    "flat_price": null,
    "is_default": false
  },
  {
    "variant_name": "Standard",
    "min_pax": 6,
    "max_pax": 15,
    "price_per_pax": 40,
    "flat_price": null,
    "is_default": true
  }
]
```

### p_inclusions (JSONB Array)
Array of inclusions and exclusions for the package. Each item must contain:
- `item_text` (string, 1-500 chars)
- `is_included` (boolean, true for inclusions, false for exclusions)
- `display_order` (integer, 1-50)

At least one item must have `is_included = true`. Maximum 50 items total.

Example:
```json
[
  {
    "item_text": "Breakfast and lunch",
    "is_included": true,
    "display_order": 1
  },
  {
    "item_text": "Hotel accommodation",
    "is_included": true,
    "display_order": 2
  },
  {
    "item_text": "Alcoholic beverages",
    "is_included": false,
    "display_order": 3
  }
]
```

### p_stops (JSONB Array)
Array of itinerary stops for the package. Each stop must contain:
- `stop_name` (string, 2-100 chars)
- `stop_description` (string, 10-1000 chars or null)
- `latitude` (numeric, -90 to 90)
- `longitude` (numeric, -180 to 180)
- `display_order` (integer, 1-50, used for ordering)

At least one stop must exist. Maximum 50 stops total. The `order_index` field will be recomputed by the function based on the order of items in the array.

Example:
```json
[
  {
    "stop_name": "Hotel Pickup",
    "stop_description": "We pick you up from your hotel lobby",
    "latitude": 10.7595,
    "longitude": 106.6848,
    "display_order": 1
  },
  {
    "stop_name": "Mekong River",
    "stop_description": "Main destination - Mekong River cruise",
    "latitude": 10.8231,
    "longitude": 106.6955,
    "display_order": 2
  }
]
```

### p_gallery (JSONB Array)
Array of gallery images for the package. Each image must contain:
- `image_url` (string, valid URL)
- `caption` (string, 0-500 chars or null)
- `display_order` (integer, 1-20)

Maximum 20 images per package.

Example:
```json
[
  {
    "image_url": "https://storage.example.com/packages/image1.jpg",
    "caption": "Beautiful sunset at the Mekong",
    "display_order": 1
  },
  {
    "image_url": "https://storage.example.com/packages/image2.jpg",
    "caption": "Local market visit",
    "display_order": 2
  }
]
```

## Return Value

Returns a table with one row containing:
- `success` (BOOLEAN): true if the update succeeded, false if any operation failed
- `updated_at` (TIMESTAMP WITH TIME ZONE): The new updated_at timestamp from the package record (null if failed)

Example successful response:
```json
{
  "success": true,
  "updated_at": "2024-01-15T14:30:45.123Z"
}
```

Example failure response:
```json
{
  "success": false,
  "updated_at": null
}
```

## Behavior

### Atomic Transaction
All database operations are executed within a single transaction:
1. Core package fields are updated
2. All price variants are deleted and new ones inserted
3. All inclusions are deleted and new ones inserted
4. All stops are deleted and new ones inserted
5. All gallery images are deleted and new ones inserted

If any step fails, the entire transaction is rolled back and no data is modified.

### Authentication & Authorization
The function is `SECURITY DEFINER`, meaning it executes with the permissions of the function owner (database superuser). However, it enforces row-level security by:
1. Checking that the authenticated user (`auth.uid()`) is the owner of the package's operator account
2. Raising an exception if the user is not authorized

### Timestamp Updates
The `updated_at` field in the `tours_packages` table is automatically set to the current server time (`now()`) when the update succeeds.

### Order Index Recomputation
For stops specifically, the `order_index` is recomputed based on the order of items in the `p_stops` array using `ROW_NUMBER() OVER ()`. This ensures that the stop order is always correct even if gaps exist in the provided `display_order` values.

For inclusions and gallery images, the `display_order` values are preserved exactly as provided.

## Concurrency Handling

The `concurrency_check` companion function can be used to detect concurrent modifications:

```sql
SELECT has_conflict, current_updated_at
FROM concurrency_check(package_id, cached_updated_at);
```

This should be called before attempting an update to ensure the package hasn't been modified by another user. If `has_conflict = true`, the update should not proceed.

## Error Handling

If an error occurs during any operation, the function:
1. Rolls back the entire transaction (all changes are undone)
2. Logs the error message
3. Returns `success = false` and `updated_at = null`

Common error scenarios:
- Package not found or access denied
- Validation constraint violations (invalid data types, value ranges)
- Database errors (connection failure, disk full, etc.)

## Usage Example

```typescript
// Call from server action or TypeScript
const { data, error } = await supabaseClient.rpc('update_package_and_relations', {
  p_package_id: 'package-uuid',
  p_package_data: {
    title: 'Updated Tour',
    location_name: 'New Location',
    description: 'Updated description',
    duration_value: 2,
    duration_type: 'days',
    cover_image_url: 'https://example.com/image.jpg'
  },
  p_price_variants: [
    {
      variant_name: 'Standard',
      min_pax: 1,
      max_pax: 10,
      price_per_pax: 100,
      flat_price: null,
      is_default: true
    }
  ],
  p_inclusions: [
    {
      item_text: 'Breakfast included',
      is_included: true,
      display_order: 1
    }
  ],
  p_stops: [
    {
      stop_name: 'Start Point',
      stop_description: 'Tour starts here',
      latitude: 10.1,
      longitude: 106.1,
      display_order: 1
    }
  ],
  p_gallery: [
    {
      image_url: 'https://example.com/image.jpg',
      caption: 'Beautiful view',
      display_order: 1
    }
  ]
});

if (data && data[0].success) {
  console.log('Update succeeded at', data[0].updated_at);
} else {
  console.log('Update failed');
}
```

## Requirements Met

This RPC function addresses the following requirements:

- **Requirement 10.1-10.10**: Save and Submit Actions
  - Atomic transaction ensures all-or-nothing updates
  - Timestamps enable concurrency detection
  - Returns success/failure status
  
- **Requirement 14.1-14.8**: Persistence and Data Consistency
  - Atomic multi-table transactions (14.1)
  - Exact persistence of provided data (14.2)
  - Cascade deletion of related entities (14.3)
  - Timestamp updates (14.4)
  - Proper error responses (14.5-14.6)
  - Timestamp-based conflict detection (14.7)
  - Concurrency check capability (14.8)

## Related Functions

- **concurrency_check(package_id, cached_updated_at)**: Detects concurrent modifications
- **replace_package_price_variants(package_id, variants)**: Legacy function for price variants
- **replace_package_stops(package_id, stops)**: Legacy function for stops (now integrated into main function)

## Row-Level Security

The function respects the following RLS policies:

- **tours_package_inclusions**: Users can only access inclusions for published packages or packages they own
- **tours_package_gallery**: Users can only access gallery for published packages or packages they own
- **tours_packages**: Operators can only update packages they own
