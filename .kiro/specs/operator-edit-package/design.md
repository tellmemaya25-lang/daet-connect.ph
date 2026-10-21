# Design Document: Operator Edit Package Feature

## Overview

The operator edit package feature enables tour operators to modify and update their tour packages within DAET-CONNECT.PH. The design implements a comprehensive editing interface with status-based field restrictions, optimistic UI updates, atomic database transactions, and conflict detection to ensure data consistency and a smooth operator experience.

The feature builds upon the existing package creation workflow, reusing validation patterns, form components, and database structures while adding new capabilities for published package management (read-only restrictions), rejection feedback display, and granular permission controls based on package status.

### Key Design Goals

1. **Permission-First Access**: Verify operator ownership and appropriate package status before any modification
2. **Status-Aware UI**: Dynamically enable/disable fields based on package status (draft, pending_review, published, archived)
3. **Data Integrity**: Use atomic transactions for multi-table updates and concurrency detection via updated_at timestamps
4. **Responsive Feedback**: Provide loading states, success messages, error handling with form data preservation
5. **Reusable Components**: Leverage existing form step components with status-aware field restrictions
6. **Scalable Persistence**: Support updates across multiple related tables (packages, variants, inclusions, stops, gallery) with proper cascade handling

---

## Architecture

### High-Level Data Flow

```
User Navigates to Edit Page
  ↓
[Route Handler: /tours/operator/packages/[id]/edit]
  ↓
[Authentication & Authorization Checks]
  ├─ Verify user authenticated
  ├─ Verify operator role
  ├─ Verify package ownership (operator_id match)
  └─ Verify package status is editable (draft, rejected, or published with restrictions)
  ↓
[Load Package Data from Supabase]
  ├─ tours_packages (core fields)
  ├─ tours_package_price_variants (pricing options)
  ├─ tours_package_inclusions (inclusions/exclusions list)
  ├─ tours_package_stops (itinerary)
  └─ tours_package_gallery (images)
  ↓
[Render Edit Form Page]
  ├─ Display rejection reason (if status = rejected)
  ├─ Pre-populate all fields
  ├─ Apply field restrictions based on status
  └─ Bind change detection handlers
  ↓
User Modifies Form & Clicks Save
  ↓
[Client-Side Change Detection]
  ├─ Compare form state with original database values
  ├─ Enable/disable Save & Submit buttons
  └─ Preserve form data in React state
  ↓
[Form Validation & Submission]
  ├─ Validate all required fields (client-side)
  ├─ Format data for server action
  └─ Include cached updated_at for concurrency check
  ↓
[Server Action: updatePackageWithDetails]
  ├─ Re-verify authentication & permissions
  ├─ Check concurrency via updated_at timestamp
  ├─ Validate all input data
  ├─ Begin atomic transaction
  │  ├─ Update tours_packages core fields
  │  ├─ Replace tours_package_price_variants (delete & recreate)
  │  ├─ Persist tours_package_inclusions with display_order
  │  ├─ Persist tours_package_stops with stop_order
  │  └─ Persist tours_package_gallery with display_order
  ├─ Commit transaction
  └─ Return success/error response
  ↓
[Client-Side Response Handling]
  ├─ Remove loading state
  ├─ Display success toast
  └─ Redirect (if "Submit for Review") or remain on page (if "Save as Draft")
```

### Route Structure

```
/tours/operator/packages/[id]/edit
├─ Page Component (page.tsx)
│  ├─ Server-side auth & data loading
│  ├─ Error boundary (404, 403)
│  └─ Render <EditPackageForm> client component
├─ Server Actions (actions.ts)
│  ├─ updatePackageCore (basic fields)
│  ├─ replacePriceVariants (atomic variant replacement)
│  ├─ updatePackageInclusions (inclusions with display_order)
│  ├─ updatePackageStops (stops with stop_order)
│  ├─ updatePackageGallery (gallery with display_order & captions)
│  ├─ updatePackageWithDetails (orchestrator combining all above)
│  └─ submitPackageForReview (status transition with conflict check)
└─ Components
   ├─ EditPackageForm (page-level component, manages overall state)
   ├─ BasicDetailsStep (title, location, description, duration)
   ├─ CoverImageStep (cover image upload & preview)
   ├─ PricingStep (manage pricing variants)
   ├─ InclusionsStep (manage inclusions/exclusions)
   ├─ StopsStep (manage itinerary stops)
   ├─ GalleryStep (manage gallery images)
   └─ RejectionNotice (display rejection feedback)
```

### Database Schema Extensions

The existing package contract is extended to support:

1. **tours_package_inclusions** (new table, if not exists)
   - `id` (uuid, primary key)
   - `package_id` (uuid, fk → tours_packages.id, cascade delete)
   - `item_text` (text, 1-500 chars)
   - `is_included` (boolean, default true)
   - `display_order` (integer, for reordering)
   - `created_at` (timestamp)
   - Constraint: At least one inclusion per package (is_included = true)

2. **tours_package_gallery** (new table, if not exists)
   - `id` (uuid, primary key)
   - `package_id` (uuid, fk → tours_packages.id, cascade delete)
   - `image_url` (text, path to stored image)
   - `caption` (text, 0-500 chars, nullable)
   - `display_order` (integer, for reordering)
   - `created_at` (timestamp)
   - Constraint: Maximum 20 images per package

3. **tours_package_stops** (extended)
   - New field: `estimated_duration_minutes` (integer, nullable, for stop timing)
   - Keep existing: `stop_order` (recomputed server-side)

4. **tours_package_price_variants** (extended)
   - Ensure constraint enforced: `(price_per_pax IS NOT NULL) OR (flat_price IS NOT NULL)`

---

## Components and Interfaces

### Page-Level Component: `EditPackageForm`

**Purpose**: Orchestrates form state, change detection, submission logic, and feedback UI.

**State Management**:
```typescript
interface EditPackageFormState {
  originalData: PackageDetailRecord; // Loaded from DB
  formData: EditPackageFormData;     // Current form state
  hasChanges: boolean;                // Change detection flag
  isSubmitting: boolean;              // Loading state
  submissionError: string | null;     // Error message
  successMessage: string | null;      // Success toast
  concurrencyError: boolean;          // 409 Conflict flag
}

interface EditPackageFormData {
  title: string;
  description: string | null;
  locationName: string;
  durationValue: number;
  durationType: "hours" | "days";
  coverImageUrl: string | null;
  priceVariants: PriceVariantInput[];
  inclusions: InclusionItem[];
  exclusions: InclusionItem[];
  stops: PackageStopInput[];
  galleryImages: GalleryItem[];
}

interface InclusionItem {
  id?: string;       // Null if new
  text: string;
  isIncluded: boolean;
  displayOrder: number;
}

interface GalleryItem {
  id?: string;           // Null if new
  imageUrl: string;
  caption: string;
  displayOrder: number;
  file?: File;           // For new uploads
}
```

**Key Functions**:
- `detectChanges()`: Compare formData with originalData, set hasChanges flag
- `handleFieldChange()`: Update formData, trigger change detection
- `handleSaveDraft()`: Validate, call updatePackageWithDetails action, show success
- `handleSubmitForReview()`: Validate, call updatePackageWithDetails + submitPackageForReview, redirect on success
- `handleImageUpload()`: Upload file, receive URL, update formData
- `handleConflictDetected()`: Display 409 error, offer reload option

**Status-Based Behavior**:
```typescript
const fieldRestrictionsPerStatus: Record<PackageStatus, FieldRestrictions> = {
  draft: {
    editable: ['all'],
    disabled: [],
    readOnly: []
  },
  pending_review: {
    editable: [],
    disabled: ['all'],
    readOnly: ['all']
  },
  published: {
    editable: ['title', 'locationName', 'description', 'durationType', 
               'inclusionItemText', 'inclusionToggle', 'galleryCaption', 
               'stopLocationName', 'stopDescription', 'stopLatitude', 'stopLongitude'],
    disabled: ['addVariant', 'deleteVariant', 'addStop', 'deleteStop', 
               'reorderStop', 'addGalleryImage', 'deleteGalleryImage', 'reorderGallery',
               'editVariantPricing', 'pricePerPax', 'flatPrice'],
    readOnly: ['defaultVariantPrice', 'variantName', 'minMaxPax']
  },
  archived: {
    editable: [],
    disabled: ['all'],
    readOnly: ['all']
  },
  rejected: {
    editable: ['all'],
    disabled: [],
    readOnly: []
  }
};
```

### Step Components with Status Awareness

Each step component (BasicDetails, Pricing, Inclusions, Stops, Gallery) receives:

```typescript
interface StepComponentProps {
  data: StepData;
  originalData: StepData;      // For change detection
  packageStatus: PackageStatus;
  onUpdate: (data: StepData) => void;
  errors?: Record<string, string>;
  loading?: boolean;
}
```

**Field Disabling Logic** (per step):
- **BasicDetailsStep**: Disable title/location/description/duration based on status
- **PricingStep**: Disable variant add/delete for published; disable pricing fields for published
- **InclusionsStep**: Disable add/delete/reorder for published; allow text edit only
- **StopsStep**: Disable add/delete/reorder for published; allow edit of location/description/coords
- **GalleryStep**: Disable add/delete/reorder for published; allow caption edit only

### RejectionNotice Component

```typescript
interface RejectionNoticeProps {
  reason: string | null;
  maxLength?: number; // Default 1000
}
```

**Behavior**:
- Show only when status = "rejected" and reason is present
- Display in prominent red notice box at form top
- Truncate with ellipsis if exceeds maxLength
- Show placeholder text if reason is null/empty

---

## Data Models

### Core Data Structures

**EditPackageFormData** (comprehensive form state):
```typescript
{
  // Basic Information
  title: string;                    // 3-150 chars
  description: string | null;       // 10-3000 chars or null
  locationName: string;             // 2-100 chars
  durationValue: number;            // 0.5-365
  durationType: "hours" | "days";
  
  // Media
  coverImageUrl: string | null;     // URL or null
  galleryImages: GalleryItem[];      // Array of images with display_order
  
  // Pricing (with is_default logic)
  priceVariants: PriceVariantInput[];
  
  // Itinerary & Inclusions
  inclusions: InclusionItem[];       // Items with is_included=true
  exclusions: InclusionItem[];       // Items with is_included=false
  stops: PackageStopInput[];         // With stop_order
}
```

**API Request/Response**:
```typescript
// Server Action Input
interface UpdatePackageRequest {
  packageId: string;
  operatorId: string;                // From session
  cachedUpdatedAt: string;           // For concurrency check
  formData: EditPackageFormData;
  action: "save_draft" | "submit_review";
}

// Server Action Response
interface UpdatePackageResponse {
  success: boolean;
  message: string;
  error?: string;
  errors?: Record<string, string>;  // Field-specific errors
  updatedAt?: string;                // New server timestamp
  data?: {
    packageId: string;
    status: PackageStatus;
  };
}

// Conflict Response (409)
interface ConflictResponse {
  success: false;
  error: string;  // "This package was modified by another user..."
  currentUpdatedAt: string;  // Server's current timestamp
}
```

**Validation Rules by Field**:

| Field | Type | Min | Max | Required | Notes |
|-------|------|-----|-----|----------|-------|
| title | string | 3 | 150 | Yes | Trimmed, non-empty |
| location_name | string | 2 | 100 | Yes | Trimmed, non-empty |
| description | string | 10 | 3000 | No | Null allowed, trimmed if provided |
| duration_value | number | 0.5 | 365 | Yes | Decimal allowed |
| cover_image_url | string | — | — | No | Null allowed, max 5MB, jpg/png/webp |
| gallery_image | string | — | — | No | Null allowed, max 5MB per image, max 20 total |
| variant_name | string | 1 | 100 | Yes | Trimmed |
| min_pax | number | 1 | 10,000 | Yes | Integer |
| max_pax | number | 1 | 10,000 | No | Integer, ≥ min_pax if provided |
| price_per_pax | number | 0.01 | 999,999.99 | Conditional | OR with flat_price |
| flat_price | number | 0.01 | 999,999.99 | Conditional | OR with price_per_pax |
| inclusion_item | string | 1 | 500 | Yes | Trimmed, max 50 items total |
| stop_location | string | 2 | 100 | Yes | Trimmed, non-empty |
| stop_description | string | 10 | 1000 | No | Null allowed, trimmed if provided |
| latitude | number | -90 | 90 | Yes | Decimal, max 50 stops |
| longitude | number | -180 | 180 | Yes | Decimal |
| gallery_caption | string | 0 | 500 | No | Null allowed, trimmed |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Prework Analysis: Acceptance Criteria Testing Prework

#### Requirement 1: Access and Authentication

1.1 Unauthenticated user redirect
   - Thoughts: This is testing specific behavior for an edge case. Unauthenticated users should be redirected. This is testable as a specific example, not a universal property.
   - Testable: yes - example

1.2 Non-operator role rejection
   - Thoughts: This is testing that any user without operator role should be denied. This is a universal property—for all non-operator authenticated users, they should get 403.
   - Testable: yes - property

1.3 Non-owner operator rejection
   - Thoughts: This is testing that operators cannot access packages they don't own. For any operator and any package they don't own, they should get 403. This is a universal property.
   - Testable: yes - property

1.4 Authorized operator sees form
   - Thoughts: For any authorized operator accessing their own package, the form should load with pre-populated data. This is a universal property.
   - Testable: yes - property

#### Requirement 2: Status-Based Field Editing

2.1 Draft status allows all edits
   - Thoughts: For any draft package owned by the operator, all fields should be editable. This is a universal property.
   - Testable: yes - property

2.2 Pending-review blocks all edits
   - Thoughts: For any pending_review package, any edit attempt should be blocked. This is a universal property.
   - Testable: yes - property

2.3 Published allows selective edits
   - Thoughts: For any published package, specific fields should be editable while others are locked. This is a universal property about field restrictions.
   - Testable: yes - property

2.4 Rejected status allows all edits
   - Thoughts: For any rejected package owned by the operator, all fields should be editable (same as draft). This is a universal property.
   - Testable: yes - property

2.5 Archived blocks all edits
   - Thoughts: For any archived package, any edit attempt should be blocked. This is a universal property.
   - Testable: yes - property

#### Requirement 3: Edit Form - Basic Information

3.1-3.8 Field validation (title, location, description, duration)
   - Thoughts: Each field has specific constraints (min/max chars, ranges). These are universal properties—for any input outside the valid range, validation should fail.
   - Testable: yes - property (for each field)

3.9 Save as Draft persists changes
   - Thoughts: For any valid form submission, changes should persist to the database. This is a universal property.
   - Testable: yes - property

3.10 Validation errors prevent save
   - Thoughts: For any invalid form submission, no changes should persist. This is a universal property.
   - Testable: yes - property

#### Requirement 4: Edit Form - Cover Image

4.1-4.6 Cover image upload validation and persistence
   - Thoughts: For any image file, validation rules should apply consistently (format, size). For valid uploads, the URL should persist. These are universal properties.
   - Testable: yes - property

#### Requirement 5: Edit Form - Pricing Variants

5.1-5.8 Pricing variant management, validation, and status-based restrictions
   - Thoughts: For any pricing variant input, validation constraints should apply. For any published package, certain operations should be disabled. These are universal properties.
   - Testable: yes - property

#### Requirement 6: Edit Form - Inclusions

6.1-6.10 Inclusions management, validation, and status-based restrictions
   - Thoughts: For any inclusion item, character limits and ordering should be respected. For published packages, add/delete/reorder should be blocked. These are universal properties.
   - Testable: yes - property

#### Requirement 7: Edit Form - Itinerary Stops

7.1-7.13 Stops management, validation, and status-based restrictions
   - Thoughts: For any stop, coordinates must be within valid ranges. For any draft package, all operations should be allowed. For published packages, specific operations should be blocked. These are universal properties.
   - Testable: yes - property

#### Requirement 8: Edit Form - Gallery Images

8.1-8.13 Gallery management, validation, and status-based restrictions
   - Thoughts: For any gallery image, upload validation should be consistent. Ordering and captions should persist. For published packages, add/delete/reorder should be blocked. These are universal properties.
   - Testable: yes - property

#### Requirement 9: Rejection Reason Display

9.1-9.5 Display rejection reason and enable resubmission
   - Thoughts: For any rejected package, if a reason exists, it should be displayed truncated. For any field edit on a rejected package, submit button should become enabled. These are universal properties.
   - Testable: yes - property

#### Requirement 10: Save and Submit Actions

10.1-10.10 Save/submit button enablement, validation, and conflict handling
   - Thoughts: For any form with no changes, buttons should be disabled. For any valid submission, data should persist. For concurrent modifications, conflict should be detected. These are universal properties.
   - Testable: yes - property

#### Requirement 11: Edit URL and Navigation

11.1-11.5 URL routing and data loading
   - Thoughts: The edit URL should follow a consistent pattern. Navigation and data loading should work for all valid operators accessing their own packages. These are universal properties.
   - Testable: yes - property

#### Requirement 12: Error Handling and Validation

12.1-12.7 Error message display and data preservation
   - Thoughts: For any validation failure, appropriate error messages should display. For any save failure, form data should be preserved. These are universal properties.
   - Testable: yes - property

#### Requirement 13: Optimistic UI Updates

13.1-13.5 Loading states and feedback messages
   - Thoughts: For any save operation, UI should show loading state. For any successful save, success message should display. For any failure, error message should persist. These are universal properties.
   - Testable: yes - property

#### Requirement 14: Persistence and Data Consistency

14.1-14.8 Atomic transactions, cascade deletion, concurrency handling
   - Thoughts: For any multi-table save operation, all changes should succeed together or all rollback. For concurrent modifications, conflict should be detected via timestamp. These are universal properties about data consistency.
   - Testable: yes - property

### Consolidated Correctness Properties

### Property 1: Access Control by Role and Ownership

*For any authenticated user and any package, if the user is not an operator or does not own the package, the edit endpoint should return HTTP 403 Forbidden.*

**Validates: Requirements 1.2, 1.3**

### Property 2: Draft Packages Allow Unrestricted Editing

*For any draft package owned by an authenticated operator, all form fields (title, description, location, duration, pricing, inclusions, stops, gallery) should be editable without restrictions.*

**Validates: Requirements 2.1, 3.1-3.10**

### Property 3: Published Packages Restrict Certain Operations

*For any published package, the following operations should be disabled: add/delete pricing variants, add/delete/reorder stops, add/delete/reorder gallery images. All pricing variant fields except min/max pax should be read-only. Base pricing (default variant) should be read-only.*

**Validates: Requirements 2.3, 5.6-5.8, 7.9-7.11, 8.9-8.11**

### Property 4: Pending Review Packages Block All Edits

*For any pending_review package, all form fields should be disabled and the form should be in read-only mode. Any edit attempt should return HTTP 403 Forbidden.*

**Validates: Requirements 2.2**

### Property 5: Archived Packages Block All Edits

*For any archived package, all form fields should be disabled and the form should be in read-only mode. Any edit attempt should return HTTP 403 Forbidden.*

**Validates: Requirements 2.5**

### Property 6: Rejected Packages Allow Resubmission

*For any rejected package, if the rejection_reason is present, it should be displayed in a prominent notice. Upon any field modification and successful save, the "Submit for Review" button should become enabled and change the status to pending_review.*

**Validates: Requirements 2.4, 9.1-9.5**

### Property 7: Field Validation Framework

*For any form field submission, if the input value violates its defined constraint (character limits, numeric ranges, required fields, coordinate bounds), the submission should fail with a specific error message for that field and no changes should persist.*

**Validates: Requirements 3.1-3.10, 4.1-4.6, 5.x, 6.x, 7.x, 8.x, 12.1-12.3**

### Property 8: Image Upload Validation

*For any image file upload, if the file format is not jpg/jpeg/png/webp or the file size exceeds 5MB, the upload should be rejected with a specific error message and the file should not be stored.*

**Validates: Requirements 4.3-4.5, 8.2-8.4**

### Property 9: Inclusion Item Constraints

*For any package, there must be at least one inclusion item (is_included = true) and at most 50 inclusion items total. Attempting to save with zero inclusions or more than 50 items should fail with an appropriate error message.*

**Validates: Requirements 6.2, 6.5**

### Property 10: Stop and Gallery Ordering Persistence

*For any package save operation, the display_order values for stops, gallery images, and inclusion items should be persisted exactly as provided, maintaining the sequence specified by the user.*

**Validates: Requirements 7.13, 8.13, 6.10**

### Property 11: Concurrency Conflict Detection

*For any concurrent modification attempts detected via updated_at timestamp mismatch, the second request should return HTTP 409 Conflict with an error message, and no changes should persist from that request.*

**Validates: Requirements 10.10, 14.7**

### Property 12: Atomic Multi-Table Transactions

*For any save operation, all database changes across tours_packages, tours_package_price_variants, tours_package_inclusions, tours_package_stops, and tours_package_gallery tables should either all succeed or all rollback together. Partial writes should never occur.*

**Validates: Requirements 14.1-14.2**

### Property 13: Change Detection for Button Enablement

*For any package in draft or rejected status, if the current form state exactly matches the original database values, both "Save as Draft" and "Submit for Review" buttons should be disabled. If any field differs, both buttons should become enabled.*

**Validates: Requirements 10.1-10.2**

### Property 14: Form Data Preservation on Error

*For any failed save operation (validation error, database error, network error), all form field values should remain populated in the UI without loss, allowing the operator to fix errors and retry.*

**Validates: Requirements 12.6, 13.5**

### Property 15: Success and Error Message Lifecycle

*For any successful save operation, a success message should display for 2-3 seconds then auto-dismiss. For any failed save, an error message should display and persist until dismissed by user or a new save attempt is made.*

**Validates: Requirements 13.2-13.4**

### Property 16: Status Transition on Submit for Review

*For any draft or rejected package successfully submitted for review, the package status should transition to pending_review, the rejection_reason should be cleared, and the user should be redirected to the package details page.*

**Validates: Requirements 9.5, 10.9**

---

## Error Handling

### Server-Side Error Categories

| Category | HTTP | Example | Handling |
|----------|------|---------|----------|
| **Unauthenticated** | 401 | User not signed in | Redirect to login with return URL |
| **Unauthorized** | 403 | Non-operator; not package owner; package not editable | Display error message, remain on page |
| **Not Found** | 404 | Package doesn't exist | Display error message, show back button |
| **Validation Error** | 400 | Invalid field values | Display field-specific errors, preserve form |
| **Conflict** | 409 | Concurrent modification detected | Display conflict message, offer reload |
| **Server Error** | 500 | Database error, unexpected exception | Display "try again later", preserve form |

### Client-Side Error Recovery

**Validation Errors**:
- Display error message next to field
- Disable form submission
- Preserve all form data
- Keep loading state OFF

**Save/Submit Errors**:
- Display error toast/banner at top
- Show error message for 5+ seconds (user can dismiss)
- Re-enable all form fields
- Preserve all form data

**Concurrency Conflict (409)**:
- Display prominent error banner
- Offer "Reload Page" button
- Offer "Continue Editing" button (loses changes)
- Preserve form data in case user chooses continue

**Network/Server Errors (5xx)**:
- Display generic error message: "An error occurred. Please try again."
- Suggest refreshing page if problem persists
- Preserve form data

---

## Testing Strategy

### Property-Based Testing Approach

This feature involves pure business logic (validation, field restrictions, state transitions) that benefits from property-based testing. Key testable properties:

1. **Access Control Properties**: Authorization logic is testable across all user types and package states
2. **Field Validation Properties**: Input validation rules apply consistently for all field types
3. **Status-Based Restriction Properties**: Field editable/disabled states depend only on package status
4. **Concurrency Properties**: Timestamp-based conflict detection is deterministic
5. **Data Persistence Properties**: Multi-table transactions either succeed together or fail together

### Unit Testing

**Form Component Unit Tests**:
- Test field validation for each field (character limits, numeric ranges)
- Test status-aware field disabling per component
- Test change detection (enable/disable buttons based on state delta)
- Test error message display
- Test image upload validation and preview generation

**Action Function Unit Tests**:
- Test authorization checks (operator role, package ownership, status)
- Test input validation (all field constraints)
- Test concurrency detection (updated_at timestamp comparison)
- Test transaction success paths (all tables updated)
- Test transaction rollback paths (one table failure)
- Test error formatting and response structure

**Data Formatting Tests**:
- Test normalization of form data to database format
- Test denormalization of database records to form state
- Test handling of null/optional fields
- Test array ordering (stops, gallery, inclusions)

### Integration Testing

**End-to-End Scenarios**:
1. Operator edits draft package, saves successfully
2. Operator edits draft package, submits for review, redirects
3. Operator attempts to edit published package, sees restrictions
4. Operator attempts to edit pending_review package, sees read-only form
5. Operator edits rejected package, sees rejection reason, submits again
6. Two operators concurrently edit same package, second gets 409 conflict
7. Operator uploads invalid image file, sees error message
8. Operator adds/deletes/reorders pricing variants in draft package
9. Operator adds/deletes/reorders stops in draft package
10. Operator adds/deletes inclusions and sees "at least one required" error
11. Operator edits gallery captions in published package (allowed)
12. Operator attempts to delete gallery image in published package (blocked)

### Snapshot Testing

- Form layouts by status (draft, published, rejected, pending_review, archived)
- Error message formats
- Success message display
- Rejection notice rendering

### Property-Based Test Configuration

- **Minimum iterations per property**: 100
- **Each property test references**: Design property number and requirements
- **Tag format**: `Feature: operator-edit-package, Property X: [description]`

### Test Environment Setup

```typescript
// Mock dependencies
- Mock Supabase client for database operations
- Mock file upload to storage (simulate success/failure)
- Mock authentication context
- Mock Next.js router for navigation

// Test data fixtures
- Valid operator profile (approved status)
- Draft package with all relationships
- Published package
- Rejected package with rejection reason
- Pending review package
- Valid/invalid file samples
- Valid/invalid input samples per field
```

### Key Test Cases by Property

**Property 1 (Access Control)**: 
- Unauthenticated user → 401
- Non-operator user → 403
- Operator accessing another's package → 403
- Approved operator accessing own package → 200 OK

**Property 2 (Draft Editing)**:
- All fields editable in UI
- All fields accepted in form submission
- All changes persist to DB

**Property 3 (Published Restrictions)**:
- Add/delete/reorder buttons disabled for variants/stops/gallery
- Price fields read-only
- Text fields editable for stop/gallery
- Published package form loads correctly

**Property 7 (Field Validation)**:
- Title < 3 chars → error
- Title > 150 chars → error
- Location < 2 chars → error
- Description < 10 chars → error (if provided)
- Duration value < 0.5 → error
- Price variant min > max → error
- Coordinates out of range → error

**Property 11 (Concurrency)**:
- Load package (updatedAt = T1)
- Another user modifies (now updatedAt = T2)
- Submit with cached T1 → 409 Conflict

**Property 12 (Atomic Transaction)**:
- Update all 5 tables successfully
- One table fails → all rollback
- DB state unchanged after failed attempt

---

## Technical Implementation Details

### Image Upload & Storage

**Upload Flow**:
1. User selects image file (client-side validation: format & size)
2. File sent to image upload action (multipart form data)
3. Server validates file (re-check format & size)
4. Upload to Supabase storage bucket: `tours-package-media/{operatorId}/{packageId}/{imageId}.{ext}`
5. Generate public URL from storage
6. Return URL to client, update form state
7. On save, persist URL to database

**Image Optimization**:
- Re-encode uploaded images to reduce file size
- Generate preview thumbnail (100x100 for gallery list)
- Use Supabase CDN for public URL delivery

**Storage Cleanup**:
- When deleting gallery image, delete associated file from storage
- On package deletion (cascade), delete all associated media files

### Form State Management

```typescript
// Client-side state in EditPackageForm component
const [originalData, setOriginalData] = useState<PackageDetailRecord>(loadedData);
const [formData, setFormData] = useState<EditPackageFormData>(hydrateFromDB(loadedData));
const [hasChanges, setHasChanges] = useState(false);

// Change detection handler
const handleFieldChange = (field: string, value: any) => {
  setFormData(prev => ({ ...prev, [field]: value }));
  const newHasChanges = !deepEqual(formData, originalData);
  setHasChanges(newHasChanges);
};

// Deep equality check
function deepEqual(a, b) {
  // Compare all fields including nested arrays (variants, stops, gallery)
  // Handle null/undefined values
  // Handle numeric precision for coordinates
}
```

### Atomic Transaction Pattern in Server Action

```typescript
async function updatePackageWithDetails(request: UpdatePackageRequest): Promise<UpdatePackageResponse> {
  // 1. Authorization & validation
  const { error: authError } = await requireApprovedOperator(client);
  if (authError) return { success: false, error: authError };
  
  const { error: ownershipError } = await requirePackageOwnership(client, request.packageId);
  if (ownershipError) return { success: false, error: ownershipError };
  
  // 2. Concurrency check
  const { data: dbRecord } = await client
    .from(PACKAGE_TABLE)
    .select('updated_at')
    .eq('id', request.packageId)
    .maybeSingle();
  
  if (dbRecord.updated_at !== request.cachedUpdatedAt) {
    return { success: false, error: 'Conflict', status: 409 };
  }
  
  // 3. Input validation
  const validationError = validateFormData(request.formData);
  if (validationError) return { success: false, error: validationError, errors: {...} };
  
  // 4. Begin transaction
  try {
    await client.rpc('update_package_and_relations', {
      package_id: request.packageId,
      package_data: normalizeCoreFields(request.formData),
      price_variants: request.formData.priceVariants,
      inclusions: request.formData.inclusions,
      stops: request.formData.stops,
      gallery: request.formData.galleryImages,
    });
    
    // 5. Success
    return { 
      success: true, 
      message: 'Package saved',
      updatedAt: newTimestamp
    };
  } catch (error) {
    // 6. Rollback happens automatically by RPC transaction
    return { 
      success: false, 
      error: 'Failed to save package'
    };
  }
}
```

### Database Transaction RPC

Create a PostgreSQL function for atomic updates:

```sql
CREATE OR REPLACE FUNCTION update_package_and_relations(
  package_id UUID,
  package_data JSONB,
  price_variants JSONB,
  inclusions JSONB,
  stops JSONB,
  gallery JSONB
) RETURNS JSONB AS $$
BEGIN
  -- Update core package fields
  UPDATE tours_packages SET
    title = package_data->>'title',
    description = package_data->>'description',
    location_name = package_data->>'location_name',
    duration_value = (package_data->>'duration_value')::numeric,
    duration_type = package_data->>'duration_type',
    cover_image_url = package_data->>'cover_image_url',
    gallery_urls = (package_data->'gallery_urls')::text[],
    updated_at = NOW()
  WHERE id = package_id;
  
  -- Delete and recreate price variants (via replace_package_price_variants)
  DELETE FROM tours_package_price_variants WHERE package_id = package_id;
  INSERT INTO tours_package_price_variants (...)
  SELECT * FROM jsonb_populate_recordset(
    NULL::tours_package_price_variants, price_variants
  );
  
  -- Upsert inclusions with display_order
  DELETE FROM tours_package_inclusions WHERE package_id = package_id;
  INSERT INTO tours_package_inclusions (...)
  SELECT * FROM jsonb_populate_recordset(
    NULL::tours_package_inclusions, inclusions
  );
  
  -- Upsert stops with stop_order recomputation
  DELETE FROM tours_package_stops WHERE package_id = package_id;
  INSERT INTO tours_package_stops (...)
  SELECT * FROM jsonb_populate_recordset(
    NULL::tours_package_stops, stops
  );
  
  -- Upsert gallery with display_order
  DELETE FROM tours_package_gallery WHERE package_id = package_id;
  INSERT INTO tours_package_gallery (...)
  SELECT * FROM jsonb_populate_recordset(
    NULL::tours_package_gallery, gallery
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'updated_at', NOW()
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql;
```

### Optimistic UI Pattern

```typescript
// In EditPackageForm component
const handleSaveDraft = async () => {
  // 1. Disable UI immediately (optimistic)
  setIsSubmitting(true);
  setSubmissionError(null);
  
  // 2. Call server action
  const result = await updatePackageWithDetails({
    packageId,
    operatorId: session.user.id,
    cachedUpdatedAt: originalData.updated_at,
    formData,
    action: 'save_draft'
  });
  
  // 3. Handle response
  if (result.success) {
    setSuccessMessage('Package saved successfully');
    setOriginalData({ ...formData, updated_at: result.updatedAt });
    setHasChanges(false);
    
    // Auto-dismiss after 2-3 seconds
    setTimeout(() => setSuccessMessage(null), 2500);
  } else if (result.status === 409) {
    // Concurrency conflict
    setSubmissionError('This package was modified by another user.');
    setConcurrencyError(true);
  } else {
    // Other error
    setSubmissionError(result.error);
  }
  
  // 4. Re-enable UI
  setIsSubmitting(false);
};
```

---

## Design Decisions & Rationales

| Decision | Rationale |
|----------|-----------|
| **Status-based field restrictions in UI** | Prevents user confusion by visually indicating locked fields rather than showing permission errors on save. Improves UX. |
| **Atomic transactions via RPC** | Ensures no partial writes across multiple related tables. Simpler than client-side transaction management. Leverages database transaction guarantees. |
| **Concurrency detection via updated_at timestamp** | Lightweight, optimistic locking. Avoids row-level locks that could block concurrent reads. Works with distributed systems. |
| **Form data preservation on error** | Respects operator's work. Prevents data loss if save fails. Shows system failures don't erase user input. |
| **Server-side validation re-check** | Client validation is UX sugar only; server is the source of truth. Prevents API abuse and data integrity issues. |
| **Image upload as separate step** | Allows preview before save. Reduces large payload size. Enables reuse of upload logic. Supports lazy loading optimization. |
| **Rejection reason display in notice** | Prominent, non-dismissible feedback helps operators understand why package was rejected and what to fix. |
| **Redirect on Submit for Review** | Clear action completion feedback. Prevents accidental re-submission. Takes user to review state display. |
| **Delete-and-recreate for variants/stops** | Simpler than upsert logic. Avoids orphaned records. Cascade delete cleanup automatic. RPC transaction ensures atomicity. |

---

## Database Dependency Notes

The design assumes these database tables and functions exist or will be created:

1. **tours_package_inclusions** - NEW table required
2. **tours_package_gallery** - NEW table required
3. **tours_package_stops** - EXTENDED with display_order or estimated_duration_minutes
4. **replace_package_price_variants** - RPC function (existing or new)
5. **update_package_and_relations** - NEW RPC function for atomic updates

These will be specified in the Tasks document with schema migration details.

---

## Conclusion

This design provides a comprehensive, status-aware package editing interface with atomic persistence, conflict detection, and excellent error handling. It reuses existing DAET-CONNECT.PH patterns (Next.js App Router, Supabase, form components) while extending them to support complex multi-table updates and published package read-only restrictions.

The property-based correctness properties formalized above guide testing and ensure the feature maintains data integrity and consistent operator experience across all package statuses.
