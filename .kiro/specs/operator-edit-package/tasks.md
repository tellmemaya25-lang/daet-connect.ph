# Implementation Plan: Operator Edit Package Feature

## Overview

The operator edit package feature implementation builds a comprehensive UI and backend for tour operators to modify their packages with status-based field restrictions, atomic multi-table transactions, and conflict detection. The implementation follows the Next.js App Router pattern with server actions for persistence, client-side form components for UI, and TypeScript for type safety.

The implementation is structured in waves to support parallel development: database setup and infrastructure tasks in early waves, core server actions in mid waves, UI components in subsequent waves, and testing in final waves.

---

## Tasks

- [x] 1. Database Setup & Schema Management
  - [x] 1.1 Create/verify tours_package_inclusions table schema
    - Create table with columns: id (uuid), package_id (uuid, fk), item_text (text), is_included (boolean), display_order (integer), created_at (timestamp)
    - Add cascade delete on package deletion
    - Add unique constraint on package_id + display_order
    - _Requirements: 6.1-6.10, 14.1-14.2_
  
  - [x] 1.2 Create/verify tours_package_gallery table schema
    - Create table with columns: id (uuid), package_id (uuid, fk), image_url (text), caption (text, nullable), display_order (integer), created_at (timestamp)
    - Add cascade delete on package deletion
    - Add unique constraint on package_id + display_order
    - Add max 20 images per package constraint (check constraint)
    - _Requirements: 8.1-8.13, 14.1-14.2_
  
  - [x] 1.3 Extend tours_package_stops table (if needed)
    - Add estimated_duration_minutes column (integer, nullable) if not already present
    - Verify stop_order recomputation logic exists
    - _Requirements: 7.1-7.13_
  
  - [x] 1.4 Create update_package_and_relations RPC function
    - Accept parameters: package_id, package_data (JSONB), price_variants (JSONB), inclusions (JSONB), stops (JSONB), gallery (JSONB)
    - Update tours_packages core fields (title, location_name, description, duration_value, duration_type, cover_image_url)
    - Delete and recreate price variants (atomic)
    - Delete and recreate inclusions with display_order preservation
    - Delete and recreate stops with stop_order recomputation
    - Delete and recreate gallery with display_order preservation
    - Return transaction success/failure with updated_at timestamp
    - _Requirements: 10.1-10.10, 14.1-14.2_
  
  - [x] 1.5 Create concurrency_check function for timestamp-based conflict detection
    - Accept parameters: package_id, cached_updated_at
    - Compare database updated_at with cached value
    - Return boolean indicating whether conflict exists
    - _Requirements: 10.10, 14.7_

- [ ] 2. Server Actions & Backend Setup
  - [x] 2.1 Create packages update server actions file
    - Create file at src/app/(subsystems)/tours/operator/packages/[id]/edit/actions.ts
    - Define async server actions with 'use server' directive
    - _Requirements: 1.1-1.4, 2.1-2.5_
  
  - [x] 2.2 Implement requireAuthenticated helper
    - Check user session exists
    - Return 401 error if not authenticated
    - Validate operator role and approved status
    - Return 403 error if not approved operator
    - _Requirements: 1.1-1.2, 11.1-11.5_
  
  - [x] 2.3 Implement requirePackageOwnership helper
    - Verify operator_id matches package owner
    - Verify package exists in database
    - Return 404 if not found
    - Return 403 if not owner
    - _Requirements: 1.3-1.4_
  
  - [x] 2.4 Implement requireEditablePackageStatus helper
    - Check package status (draft, rejected, published)
    - For published: verify fields being edited are in allowed list
    - For pending_review/archived: return 403 forbidden
    - Return status-specific error messages
    - _Requirements: 2.1-2.5_
  
  - [ ] 2.5 Implement loadPackageForEdit server action
    - Verify authentication and ownership
    - Load from tours_packages, tours_package_price_variants, tours_package_inclusions, tours_package_stops, tours_package_gallery
    - Normalize database format to form data structure
    - Return complete package record with all relationships
    - Handle 404 if package not found
    - _Requirements: 3.9-3.10, 11.1-11.5_
  
  - [ ] 2.6 Implement validatePackageFormData function
    - Validate title: 3-150 chars, required
    - Validate location_name: 2-100 chars, required
    - Validate description: 10-3000 chars if provided
    - Validate duration_value: 0.5-365, required
    - Validate duration_type: "hours" or "days", required
    - Return object with validation success flag and field-specific errors
    - _Requirements: 3.1-3.8, 12.1-12.7_
  
  - [ ] 2.7 Implement validatePricingVariants function
    - Check at least one variant exists
    - Validate min_pax: 1-10,000 integer, required
    - Validate max_pax: 1-10,000 integer, ≥ min_pax
    - Validate price_per_pax OR flat_price exists (not both null)
    - Validate price range: 0.01-999,999.99
    - Validate variant_name: 1-100 chars
    - Enforce exactly one is_default = true
    - Return validation result with errors
    - _Requirements: 5.1-5.8, 12.1-12.7_
  
  - [ ] 2.8 Implement validateInclusions function
    - Check at least one inclusion (is_included = true) exists
    - Check max 50 items total
    - Validate item_text: 1-500 chars per item
    - Verify display_order unique and sequential
    - Return validation result with errors
    - _Requirements: 6.1-6.10, 12.1-12.7_
  
  - [ ] 2.9 Implement validateStops function
    - Check at least one stop exists
    - Check max 50 stops total
    - Validate location_name: 2-100 chars, required
    - Validate description: 10-1000 chars if provided
    - Validate latitude: -90 to 90, required
    - Validate longitude: -180 to 180, required
    - Verify stop_order unique and sequential
    - Return validation result with errors
    - _Requirements: 7.1-7.13, 12.1-12.7_
  
  - [ ] 2.10 Implement validateGalleryImages function
    - Check max 20 images total
    - Validate caption: 0-500 chars if provided
    - Verify display_order unique and sequential
    - Return validation result with errors
    - _Requirements: 8.1-8.13, 12.1-12.7_
  
  - [ ] 2.11 Implement updatePackageCore server action
    - Call requireAuthenticated, requirePackageOwnership, requireEditablePackageStatus
    - Validate form data (basic info, pricing, inclusions, stops, gallery)
    - Check concurrency via updated_at timestamp
    - Call update_package_and_relations RPC with normalized form data
    - Handle errors: 409 conflict, 400 validation, 500 database
    - Return response with success flag, message, updatedAt, and field-specific errors
    - _Requirements: 3.9-3.10, 10.1-10.10, 14.1-14.8_
  
  - [ ] 2.12 Implement submitPackageForReview server action
    - Call updatePackageCore action first to persist changes
    - On success, update package status to "pending_review"
    - Clear rejection_reason field
    - Return success response with redirect info
    - Handle all error cases from updatePackageCore
    - _Requirements: 9.4-9.5, 10.7-10.10_
  
  - [ ] 2.13 Implement uploadPackageImage server action
    - Verify authentication and operator status
    - Accept image file (FormData)
    - Validate file format: jpg, jpeg, png, webp only
    - Validate file size: max 5MB
    - Upload to Supabase storage bucket: tours-package-media/{operatorId}/{packageId}/{imageId}.{ext}
    - Generate public URL from storage
    - Return URL or error response
    - _Requirements: 4.3-4.6, 8.2-8.4_
  
  - [ ] 2.14 Implement deletePackageImage server action
    - Verify authentication and package ownership
    - Check package status allows deletion (draft status only)
    - Delete file from Supabase storage
    - Return success confirmation
    - _Requirements: 8.7_
  
  - [ ] 2.15 Checkpoint - Server Actions Complete
    - Verify all server actions are implemented and typed
    - Test with unit tests that server actions validate inputs correctly
    - Test that server actions verify permissions properly

- [ ] 3. Route Setup & Page Component
  - [ ] 3.1 Create page route directory structure
    - Create directory: src/app/(subsystems)/tours/operator/packages/[id]/edit/
    - Create file: page.tsx (Server Component)
    - _Requirements: 11.1-11.5_
  
  - [ ] 3.2 Implement EditPackage page component
    - Accept [id] parameter (package ID)
    - Call loadPackageForEdit server action
    - Handle loading state while fetching data
    - Handle 404 error: display "Package not found" with back button
    - Handle 403 error: display "Access denied" with back button
    - Handle 500 error: display "Unable to load package data"
    - Pass loaded data to EditPackageForm client component
    - _Requirements: 1.1-1.4, 11.1-11.5_
  
  - [ ] 3.3 Add error boundary for EditPackage page
    - Catch and display errors gracefully
    - Provide back navigation for users
    - _Requirements: 12.5_

- [ ] 4. Core Form Component: EditPackageForm
  - [ ] 4.1 Create EditPackageForm component file
    - Create file: src/app/(subsystems)/tours/operator/packages/[id]/edit/EditPackageForm.tsx
    - Export client component ('use client' directive)
    - Accept props: packageData, packageStatus, onSuccess callback
    - _Requirements: 2.1-2.5, 3.1-3.10_
  
  - [ ] 4.2 Implement form state management in EditPackageForm
    - Define EditPackageFormState interface with originalData, formData, hasChanges, isSubmitting, submissionError, successMessage, concurrencyError
    - Initialize useState with loaded package data
    - Implement state setters for each property
    - _Requirements: 3.1-3.10, 10.1-10.2_
  
  - [ ] 4.3 Implement change detection in EditPackageForm
    - Create detectChanges() function comparing formData with originalData
    - Handle nested objects (variants, stops, inclusions, gallery)
    - Handle null/undefined fields properly
    - Set hasChanges flag on any field change
    - _Requirements: 10.1-10.2_
  
  - [ ] 4.4 Implement field change handler in EditPackageForm
    - Create handleFieldChange(field, value) function
    - Update formData state
    - Trigger change detection
    - Call detectChanges to update hasChanges flag
    - _Requirements: 3.1-3.10_
  
  - [ ] 4.5 Implement Save Draft handler in EditPackageForm
    - Create handleSaveDraft() async function
    - Validate form data client-side
    - Set isSubmitting = true, show loading indicator
    - Call updatePackageCore server action
    - On success: update originalData, set hasChanges = false, show success toast
    - On error: display error message, preserve form data
    - Set isSubmitting = false
    - Auto-dismiss success message after 2-3 seconds
    - _Requirements: 3.9-3.10, 10.1-10.10, 13.1-13.5_
  
  - [ ] 4.6 Implement Submit for Review handler in EditPackageForm
    - Create handleSubmitForReview() async function
    - Validate form data client-side
    - Set isSubmitting = true, show loading indicator
    - Call submitPackageForReview server action
    - On success: show success message, redirect to package details page
    - On 409 conflict error: set concurrencyError, display conflict message with reload option
    - On other errors: display error message, preserve form data
    - Set isSubmitting = false
    - _Requirements: 9.5, 10.7-10.10_
  
  - [ ] 4.7 Implement button enablement logic in EditPackageForm
    - Disable "Save as Draft" and "Submit for Review" buttons if:
      - isSubmitting = true
      - hasChanges = false
      - Any validation error exists
    - Enable buttons if hasChanges = true and no validation errors
    - _Requirements: 10.1-10.2_
  
  - [ ] 4.8 Implement form rendering in EditPackageForm
    - Render RejectionNotice if status = rejected and rejection_reason exists
    - Render loading indicator overlay if isSubmitting
    - Render success message toast if successMessage exists
    - Render error banner if submissionError exists
    - Render concurrency conflict banner if concurrencyError
    - Render step components: BasicDetailsStep, CoverImageStep, PricingStep, InclusionsStep, StopsStep, GalleryStep
    - Render Save as Draft and Submit for Review buttons
    - Pass packageStatus to all step components for status-aware field disabling
    - _Requirements: 2.1-2.5, 3.1-3.10, 13.1-13.5_
  
  - [ ] 4.9 Checkpoint - EditPackageForm Complete
    - Test form state management works correctly
    - Test change detection triggers on field modifications
    - Test Save Draft and Submit buttons function with server actions

- [ ] 5. Step Components: Basic Information & Cover Image
  - [ ] 5.1 Create BasicDetailsStep component
    - Create file: src/app/(subsystems)/tours/operator/packages/[id]/edit/BasicDetailsStep.tsx
    - Accept props: data, originalData, packageStatus, onUpdate, errors, loading
    - Render fields: title, location_name, description, duration_value, duration_type
    - Apply status-based field disabling per design
    - _Requirements: 3.1-3.8_
  
  - [ ] 5.2 Implement title field in BasicDetailsStep
    - Render text input with label "Title"
    - Show character count and max (150)
    - Show validation error if present
    - Disable if packageStatus = pending_review or archived
    - _Requirements: 3.1-3.2, 2.3_
  
  - [ ] 5.3 Implement location_name field in BasicDetailsStep
    - Render text input with label "Location"
    - Show character count and max (100)
    - Show validation error if present
    - Disable if packageStatus = pending_review or archived
    - _Requirements: 3.3-3.4, 2.3_
  
  - [ ] 5.4 Implement description field in BasicDetailsStep
    - Render textarea with label "Description"
    - Show character count and max (3000)
    - Show validation error if present
    - Disable if packageStatus = pending_review or archived
    - _Requirements: 3.5-3.6, 2.3_
  
  - [ ] 5.5 Implement duration fields in BasicDetailsStep
    - Render numeric input for duration_value (0.5-365)
    - Render dropdown for duration_type (hours/days)
    - Show validation error if present
    - For published: disable duration_value editing, allow duration_type
    - For pending_review/archived: disable both
    - _Requirements: 3.7-3.8, 2.3_
  
  - [ ] 5.6 Create CoverImageStep component
    - Create file: src/app/(subsystems)/tours/operator/packages/[id]/edit/CoverImageStep.tsx
    - Accept props: data, originalData, packageStatus, onUpdate, errors, loading
    - _Requirements: 4.1-4.6_
  
  - [ ] 5.7 Implement cover image display in CoverImageStep
    - If coverImageUrl exists: render preview image with dimensions
    - If coverImageUrl null: render placeholder "No cover image selected"
    - Show "Upload New Image" or "Upload Image" button
    - Disable button if packageStatus = pending_review or archived
    - _Requirements: 4.1-4.2_
  
  - [ ] 5.8 Implement image upload handler in CoverImageStep
    - Create handleImageUpload() function accepting File
    - Call uploadPackageImage server action
    - Client-side validation: check format (jpg, png, webp), size < 5MB
    - Display validation errors if check fails
    - Show loading indicator during upload
    - On success: update coverImageUrl, show success message
    - On error: display error message
    - _Requirements: 4.3-4.6_

- [ ] 6. Step Components: Pricing & Inclusions
  - [ ] 6.1 Create PricingStep component
    - Create file: src/app/(subsystems)/tours/operator/packages/[id]/edit/PricingStep.tsx
    - Accept props: data, originalData, packageStatus, onUpdate, errors, loading
    - Render table with existing price variants
    - Columns: variant_name, min_pax, max_pax, price_per_pax, flat_price, is_default, actions
    - Render "Add Variant" button (disabled for published packages)
    - _Requirements: 5.1-5.8_
  
  - [ ] 6.2 Implement add pricing variant form in PricingStep
    - Show form modal/drawer with fields: variant_name, min_pax, max_pax, price_per_pax, flat_price, is_default checkbox
    - Validate on submit: min_pax ≤ max_pax, price range 0.01-999,999.99
    - Handle is_default: only one per package allowed (auto-unset other)
    - Add new variant to formData array with onUpdate callback
    - Show error messages if validation fails
    - _Requirements: 5.2-5.5_
  
  - [ ] 6.3 Implement edit pricing variant in PricingStep
    - For published packages: only allow editing min_pax, max_pax
    - For draft packages: allow all fields
    - Update variant in formData array with onUpdate callback
    - _Requirements: 5.8_
  
  - [ ] 6.4 Implement delete pricing variant in PricingStep
    - Remove variant from formData array
    - Call onUpdate to update parent state
    - Disable for published packages
    - _Requirements: 5.6-5.7_
  
  - [ ] 6.5 Create InclusionsStep component
    - Create file: src/app/(subsystems)/tours/operator/packages/[id]/edit/InclusionsStep.tsx
    - Accept props: data, originalData, packageStatus, onUpdate, errors, loading
    - Display Inclusions section (is_included = true) and Exclusions section (is_included = false)
    - Show table with columns: item_text, is_included toggle, display_order, actions
    - Render "Add Inclusion" button (disabled for published packages)
    - Show warning if no inclusions exist
    - _Requirements: 6.1-6.10_
  
  - [ ] 6.6 Implement add inclusion item in InclusionsStep
    - Show form with text input (1-500 chars) and dropdown (Included/Excluded)
    - Validate max 50 items total
    - Add new item to appropriate array (inclusions or exclusions)
    - Assign next display_order value
    - Call onUpdate
    - _Requirements: 6.3-6.5_
  
  - [ ] 6.7 Implement edit inclusion item text in InclusionsStep
    - For published: allow text edit only
    - For draft: allow text edit and is_included toggle
    - Update item in array with onUpdate
    - Validate text length 1-500 chars
    - _Requirements: 6.6, 6.9_
  
  - [ ] 6.8 Implement delete inclusion item in InclusionsStep
    - Remove item from array
    - Call onUpdate
    - Verify at least one inclusion remains (show error if deleting last)
    - Disable for published packages
    - _Requirements: 6.7, 6.9_
  
  - [ ] 6.9 Implement reorder inclusions in InclusionsStep
    - Allow drag-and-drop or numbered input for display_order
    - Update display_order values on reorder
    - Call onUpdate
    - Disable for published packages
    - _Requirements: 6.8, 6.10_

- [ ] 7. Step Components: Stops & Gallery
  - [ ] 7.1 Create StopsStep component
    - Create file: src/app/(subsystems)/tours/operator/packages/[id]/edit/StopsStep.tsx
    - Accept props: data, originalData, packageStatus, onUpdate, errors, loading
    - Display stops sorted by stop_order
    - Columns: stop_order, location_name, description, latitude, longitude, actions
    - Show "Add Stop" button (disabled for published packages)
    - Show reorder interface (numbered inputs or drag-and-drop)
    - _Requirements: 7.1-7.13_
  
  - [ ] 7.2 Implement add stop in StopsStep
    - Show form with fields: location_name (2-100 chars), description (10-1000 chars), latitude (-90 to 90), longitude (-180 to 180)
    - Validate all fields
    - Check max 50 stops per package
    - Add new stop with next stop_order value
    - Call onUpdate
    - _Requirements: 7.3-7.5_
  
  - [ ] 7.3 Implement edit stop in StopsStep
    - For published: allow editing location_name, description, latitude, longitude
    - For draft: allow all edits
    - Validate fields per requirement 7.3
    - Update stop in array with onUpdate
    - _Requirements: 7.6, 7.12_
  
  - [ ] 7.4 Implement delete stop with confirmation in StopsStep
    - Show confirmation dialog: "Are you sure you want to delete this stop?"
    - Remove from stops array on confirm
    - Call onUpdate
    - Disable for published packages
    - _Requirements: 7.7_
  
  - [ ] 7.5 Implement reorder stops in StopsStep
    - Allow editing stop_order numbered fields or drag-and-drop
    - Update stop_order values across all stops
    - Call onUpdate
    - Disable for published packages
    - _Requirements: 7.8, 7.13_
  
  - [ ] 7.6 Create GalleryStep component
    - Create file: src/app/(subsystems)/tours/operator/packages/[id]/edit/GalleryStep.tsx
    - Accept props: data, originalData, packageStatus, onUpdate, errors, loading
    - Display gallery images sorted by display_order in grid
    - Show thumbnail (100x100), caption, display_order, actions
    - Show "Add Image" button (disabled for published packages)
    - Show reorder interface (numbered inputs or drag-and-drop)
    - _Requirements: 8.1-8.13_
  
  - [ ] 7.7 Implement add gallery image in GalleryStep
    - Show file input for image (jpg, jpeg, png, webp)
    - Show text input for caption (0-500 chars)
    - Client-side validation: format check, size < 5MB
    - Call uploadPackageImage server action
    - On success: add to gallery array with next display_order
    - Call onUpdate
    - Check max 20 images per package
    - _Requirements: 8.2-8.5_
  
  - [ ] 7.8 Implement edit gallery image caption in GalleryStep
    - Show caption edit field (0-500 chars)
    - For published: only caption editable
    - For draft: caption editable
    - Update gallery item with onUpdate
    - _Requirements: 8.6, 8.12_
  
  - [ ] 7.9 Implement delete gallery image with confirmation in GalleryStep
    - Show confirmation dialog: "Are you sure you want to delete this image?"
    - Call deletePackageImage server action on confirm
    - Remove from gallery array
    - Call onUpdate
    - Disable for published packages
    - _Requirements: 8.7_
  
  - [ ] 7.10 Implement reorder gallery images in GalleryStep
    - Allow numbered inputs or drag-and-drop for display_order
    - Update display_order values
    - Call onUpdate
    - Disable for published packages
    - _Requirements: 8.8, 8.13_

- [ ] 8. Utility Component: RejectionNotice
  - [ ] 8.1 Create RejectionNotice component
    - Create file: src/app/(subsystems)/tours/operator/packages/[id]/edit/RejectionNotice.tsx
    - Accept props: reason (string | null), maxLength (default 1000)
    - Only render if reason exists and is non-empty
    - Display in red box with white text, header "Rejection Reason:"
    - Truncate reason to maxLength with ellipsis if needed
    - Show placeholder text if reason is null/empty
    - _Requirements: 9.1-9.3_

- [ ] 9. Validation Utilities
  - [ ] 9.1 Create validation utilities file
    - Create file: src/app/(subsystems)/tours/operator/packages/[id]/edit/validation.ts
    - Export validation functions for form data
    - _Requirements: 3.1-3.10, 5.1-5.8, 6.1-6.10, 7.1-7.13, 8.1-8.13_
  
  - [ ] 9.2 Implement validateBasicInfo function
    - Validate title: required, 3-150 chars, trimmed
    - Validate location_name: required, 2-100 chars, trimmed
    - Validate description: if provided, 10-3000 chars, trimmed
    - Validate duration_value: required, 0.5-365
    - Validate duration_type: required, "hours" or "days"
    - Return { valid: boolean, errors: Record<string, string> }
    - _Requirements: 3.1-3.8, 12.1-12.7_
  
  - [ ] 9.3 Implement validatePricing function (client-side)
    - Check at least one variant exists
    - For each variant: validate min_pax (1-10,000), max_pax (1-10,000), prices (0.01-999,999.99)
    - Check min_pax ≤ max_pax
    - Check at least one default variant
    - Return validation result with field errors
    - _Requirements: 5.1-5.8, 12.1-12.7_
  
  - [ ] 9.4 Implement validateInclusions function (client-side)
    - Check at least one inclusion exists
    - Check max 50 items total
    - For each item: validate text 1-500 chars
    - Return validation result
    - _Requirements: 6.1-6.10, 12.1-12.7_
  
  - [ ] 9.5 Implement validateStops function (client-side)
    - Check at least one stop exists
    - Check max 50 stops total
    - For each stop: validate location_name (2-100), description (10-1000 if provided), coordinates (-90 to 90, -180 to 180)
    - Return validation result
    - _Requirements: 7.1-7.13, 12.1-12.7_
  
  - [ ] 9.6 Implement validateGallery function (client-side)
    - Check max 20 images total
    - For each image: validate caption 0-500 chars if provided
    - Return validation result
    - _Requirements: 8.1-8.13, 12.1-12.7_
  
  - [ ] 9.7 Implement parseValidationErrors function
    - Convert server validation error response to field-level display format
    - Map error messages to component fields
    - Handle nested errors (variants, inclusions, stops, gallery)
    - Return errors by field/section
    - _Requirements: 12.1-12.7_

- [ ] 10. Styling & UX Refinement
  - [ ] 10.1 Apply Tailwind CSS styling to all components
    - Style form layout with proper spacing and typography
    - Style input fields, textareas, selects, buttons
    - Apply focus states for accessibility
    - _Requirements: All_
  
  - [ ] 10.2 Implement loading indicators and disabled states
    - Show spinner overlay during form submission
    - Disable all inputs during isSubmitting state
    - Show loading states on file uploads
    - _Requirements: 13.1-13.5_
  
  - [ ] 10.3 Implement status-aware field disabling
    - Apply disabled attribute to fields based on packageStatus
    - Apply read-only attribute where appropriate
    - Provide visual feedback for disabled fields
    - _Requirements: 2.1-2.5_
  
  - [ ] 10.4 Implement success/error message toasts
    - Show success message for 2-3 seconds then auto-dismiss
    - Show error message persistent until dismissed by user
    - Style with appropriate colors and icons
    - _Requirements: 13.1-13.5_
  
  - [ ] 10.5 Implement responsive design
    - Ensure forms are mobile-friendly
    - Stack fields vertically on small screens
    - Adjust grid layouts for galleries and variants
    - _Requirements: All_

- [ ] 11. Testing: Unit Tests for Server Actions
  - [ ] 11.1 Write unit tests for validateBasicInfo
    - **Property 7: Field Validation Framework**
    - **Validates: Requirements 3.1-3.8**
    - Test valid inputs pass
    - Test invalid title length (< 3, > 150)
    - Test invalid location length (< 2, > 100)
    - Test invalid description length (< 10, > 3000)
    - Test invalid duration_value (< 0.5, > 365)
    - Test invalid duration_type
  
  - [ ] 11.2 Write unit tests for validatePricingVariants
    - **Property 7: Field Validation Framework**
    - **Validates: Requirements 5.1-5.8**
    - Test valid variant data
    - Test min_pax > max_pax error
    - Test price outside range 0.01-999,999.99
    - Test at least one default variant required
    - Test variant_name length validation
  
  - [ ] 11.3 Write unit tests for validateInclusions
    - **Property 7: Field Validation Framework**
    - **Validates: Requirements 6.1-6.10**
    - Test valid inclusions data
    - Test at least one inclusion required
    - Test max 50 items constraint
    - Test item_text length validation (1-500)
  
  - [ ] 11.4 Write unit tests for validateStops
    - **Property 7: Field Validation Framework**
    - **Validates: Requirements 7.1-7.13**
    - Test valid stops data
    - Test at least one stop required
    - Test max 50 stops constraint
    - Test coordinate validation (-90 to 90, -180 to 180)
    - Test location_name and description length constraints
  
  - [ ] 11.5 Write unit tests for validateGalleryImages
    - **Property 7: Field Validation Framework**
    - **Validates: Requirements 8.1-8.13**
    - Test valid gallery data
    - Test max 20 images constraint
    - Test caption length validation (0-500)
  
  - [ ] 11.6 Write unit tests for requirePackageOwnership
    - **Property 1: Access Control by Role and Ownership**
    - **Validates: Requirements 1.2-1.3**
    - Test owner can access own package
    - Test non-owner gets 403 forbidden
    - Test non-existent package gets 404
  
  - [ ] 11.7 Write unit tests for requireEditablePackageStatus
    - **Property 2: Draft Packages Allow Unrestricted Editing**
    - **Property 3: Published Packages Restrict Certain Operations**
    - **Property 4: Pending Review Packages Block All Edits**
    - **Property 5: Archived Packages Block All Edits**
    - **Validates: Requirements 2.1-2.5**
    - Test draft status allows all edits
    - Test published status restricts operations
    - Test pending_review returns 403
    - Test archived returns 403
  
  - [ ] 11.8 Write unit tests for image validation
    - **Property 8: Image Upload Validation**
    - **Validates: Requirements 4.3-4.5, 8.2-8.4**
    - Test valid file formats (jpg, png, webp)
    - Test invalid format rejection
    - Test file size validation (max 5MB)
    - Test oversized file rejection
  
  - [ ] 11.9 Write unit tests for concurrency detection
    - **Property 11: Concurrency Conflict Detection**
    - **Validates: Requirements 10.10, 14.7**
    - Test timestamp match allows update
    - Test timestamp mismatch returns 409
    - Test correct error message in conflict response
  
  - [ ] 11.10 Checkpoint - Unit Tests Complete
    - Run all unit tests and verify pass
    - Check test coverage for all validation functions

- [ ] 12. Testing: Integration Tests
  - [ ] 12.1 Write integration test: operator edits draft package basic info
    - **Property 2: Draft Packages Allow Unrestricted Editing**
    - **Validates: Requirements 3.1-3.10**
    - Load package for edit
    - Modify title, location, description, duration
    - Save as draft
    - Verify changes persist to database
    - Verify updated_at timestamp updated
  
  - [ ] 12.2 Write integration test: operator cannot edit pending_review package
    - **Property 4: Pending Review Packages Block All Edits**
    - **Validates: Requirements 2.2**
    - Load pending_review package
    - Attempt to modify field
    - Verify 403 error returned
    - Verify no changes persist
  
  - [ ] 12.3 Write integration test: operator cannot edit archived package
    - **Property 5: Archived Packages Block All Edits**
    - **Validates: Requirements 2.5**
    - Load archived package
    - Attempt to modify field
    - Verify 403 error returned
    - Verify no changes persist
  
  - [ ] 12.4 Write integration test: operator edits published package with restrictions
    - **Property 3: Published Packages Restrict Certain Operations**
    - **Validates: Requirements 2.3, 5.6-5.8, 7.9-7.11, 8.9-8.11**
    - Load published package
    - Attempt to add pricing variant (should fail/be disabled)
    - Attempt to add stop (should fail/be disabled)
    - Attempt to add gallery image (should fail/be disabled)
    - Modify allowed field (e.g., title, stop description)
    - Verify changes persist
    - Verify forbidden operations rejected
  
  - [ ] 12.5 Write integration test: rejection reason displays for rejected packages
    - **Property 6: Rejected Packages Allow Resubmission**
    - **Validates: Requirements 9.1-9.5**
    - Load rejected package with rejection_reason
    - Verify RejectionNotice displays with reason text
    - Verify reason truncated to 1000 chars if longer
    - Modify field and verify Submit for Review becomes enabled
    - Submit for review and verify status changes to pending_review
    - Verify rejection_reason cleared
  
  - [ ] 12.6 Write integration test: concurrency conflict detection
    - **Property 11: Concurrency Conflict Detection**
    - **Validates: Requirements 10.10, 14.7**
    - Load package (capture updated_at = T1)
    - Another client modifies package (now updated_at = T2)
    - Submit form with cached T1
    - Verify 409 Conflict error
    - Verify no changes persist from second request
    - Verify error message displayed to user
  
  - [ ] 12.7 Write integration test: atomic transaction success
    - **Property 12: Atomic Multi-Table Transactions**
    - **Validates: Requirements 14.1-14.2**
    - Save package with changes to all 5 tables (packages, variants, inclusions, stops, gallery)
    - Verify all changes persist successfully
    - Verify updated_at timestamp reflects changes
  
  - [ ] 12.8 Write integration test: atomic transaction rollback
    - **Property 12: Atomic Multi-Table Transactions**
    - **Validates: Requirements 14.1-14.2**
    - Save package with invalid data in one table (e.g., invalid pricing)
    - Verify all changes rolled back (none persist)
    - Verify no partial writes occurred
    - Verify error message returned
  
  - [ ] 12.9 Write integration test: form data preservation on error
    - **Property 14: Form Data Preservation on Error**
    - **Validates: Requirements 12.6, 13.5**
    - Modify form fields
    - Submit with validation error
    - Verify all form values still present
    - Verify operator can fix errors and retry without retyping
  
  - [ ] 12.10 Checkpoint - Integration Tests Complete
    - Run all integration tests and verify pass
    - Test both success and error paths

- [ ] 13. Testing: Property-Based Tests
  - [ ] 13.1 Write property test for field validation universality
    - **Property 7: Field Validation Framework**
    - **Validates: Requirements 3.1-3.10, 12.1-12.7**
    - For any field with character constraints: test 100+ random inputs
    - Verify all inputs < min length rejected
    - Verify all inputs > max length rejected
    - Verify all inputs within range accepted
    - Verify validation error messages consistent
  
  - [ ] 13.2 Write property test for pricing variant constraints
    - **Property 7: Field Validation Framework**
    - **Validates: Requirements 5.1-5.8**
    - For any pricing variant: verify min_pax ≤ max_pax always holds
    - For any price: verify price between 0.01-999,999.99
    - For any package: verify exactly one default variant
    - For any invalid combination: verify rejection
  
  - [ ] 13.3 Write property test for inclusion item constraints
    - **Property 9: Inclusion Item Constraints**
    - **Validates: Requirements 6.2, 6.5**
    - For any package: verify at least one inclusion exists after save
    - For any save attempt with zero inclusions: verify rejection
    - For any save attempt with > 50 items: verify rejection
    - For any valid save: verify item count 1-50
  
  - [ ] 13.4 Write property test for coordinate validation
    - **Property 7: Field Validation Framework**
    - **Validates: Requirements 7.1-7.13**
    - For any latitude: verify -90 to 90 range enforced
    - For any longitude: verify -180 to 180 range enforced
    - For any out-of-range coordinate: verify rejection
    - For any valid coordinate: verify acceptance
  
  - [ ] 13.5 Write property test for ordering persistence
    - **Property 10: Stop and Gallery Ordering Persistence**
    - **Validates: Requirements 7.13, 8.13, 6.10**
    - For any array of items (stops, gallery, inclusions): verify display_order unique
    - For any reordered array: verify new display_order persisted exactly as submitted
    - For any out-of-order submission: verify acceptance and persistence
    - For any duplicate display_order: verify rejection or auto-correction
  
  - [ ] 13.6 Write property test for status-based field restrictions
    - **Property 2: Draft Packages Allow Unrestricted Editing**
    - **Property 3: Published Packages Restrict Certain Operations**
    - **Property 4: Pending Review Packages Block All Edits**
    - **Validates: Requirements 2.1-2.5**
    - For any draft package: verify all fields editable
    - For any published package: verify restricted operations blocked
    - For any pending_review/archived: verify all operations blocked
    - For any status transition: verify restrictions applied immediately
  
  - [ ] 13.7 Write property test for change detection
    - **Property 13: Change Detection for Button Enablement**
    - **Validates: Requirements 10.1-10.2**
    - For any form state matching original DB: verify buttons disabled
    - For any form state differing from original: verify buttons enabled
    - For any single field change: verify hasChanges flag set to true
    - For any revert to original: verify hasChanges flag set to false
  
  - [ ] 13.8 Write property test for transaction atomicity
    - **Property 12: Atomic Multi-Table Transactions**
    - **Validates: Requirements 14.1-14.2**
    - For any successful multi-table update: verify all changes persist
    - For any failed update with one table error: verify all rolled back
    - For any partial update attempt: verify no writes at all
    - Verify transaction isolation prevents dirty reads
  
  - [ ] 13.9 Write property test for concurrency handling
    - **Property 11: Concurrency Conflict Detection**
    - **Validates: Requirements 10.10, 14.7**
    - For any concurrent modification: verify second request detects conflict
    - For any timestamp mismatch: verify 409 response
    - For any conflict: verify no changes persist from conflicting request
    - For any matching timestamp: verify update proceeds
  
  - [ ] 13.10 Checkpoint - Property-Based Tests Complete
    - Run all property tests with 100+ iterations
    - Verify all properties hold across test cases

- [ ] 14. E2E Tests (Optional but Recommended)
  - [ ] 14.1* Write E2E test: operator edits draft package and saves
    - Navigate to edit URL
    - Modify form fields
    - Click Save as Draft
    - Verify success message
    - Verify database updated
    - Navigate away and back to verify persistence
    - _Requirements: 3.9-3.10, 10.1-10.10_
  
  - [ ] 14.2* Write E2E test: operator submits package for review
    - Navigate to edit URL for draft package
    - Modify fields and click Submit for Review
    - Verify success message and redirect to package details
    - Verify database status changed to pending_review
    - _Requirements: 9.5, 10.7-10.10_
  
  - [ ] 14.3* Write E2E test: unauthenticated user redirected
    - Clear authentication
    - Navigate to edit URL
    - Verify redirect to login page with return URL
    - _Requirements: 1.1_
  
  - [ ] 14.4* Write E2E test: non-owner operator gets 403
    - Authenticate as different operator
    - Navigate to edit URL for another operator's package
    - Verify 403 Forbidden error displayed
    - _Requirements: 1.3_
  
  - [ ] 14.5* Write E2E test: published package restrictions work
    - Navigate to edit URL for published package
    - Verify pricing, stops, gallery add buttons disabled
    - Edit allowed field (title) and save
    - Verify changes persisted
    - _Requirements: 2.3, 5.6-5.8, 7.9-7.11, 8.9-8.11_

- [ ] 15. Final Checkpoint - All Tests Pass
  - Ensure all unit tests pass
  - Ensure all integration tests pass
  - Ensure all property-based tests pass
  - Verify test coverage for validation, permissions, persistence
  - Run E2E tests if implemented
  - Verify all requirements covered by tests

---

## Notes

- Tasks marked with `*` are optional and can be skipped for MVP (e.g., E2E tests)
- Each task references specific requirements for traceability
- Change detection in 4.3 and 4.7 are critical for button enablement logic
- Server actions in section 2 are foundation for all UI operations
- Status-based field restrictions (2.4) are enforced both server-side and UI-side
- Property-based tests in section 13 validate universal correctness properties
- All timestamps use UTC with millisecond precision for consistency
- Database cascade deletes ensure no orphaned records on package updates
- Atomic transactions via RPC ensure multi-table consistency
- Form data preservation on error (section 12.9) improves UX significantly

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4"] },
    { "id": 2, "tasks": ["2.5", "2.6", "2.7", "2.8", "2.9", "2.10"] },
    { "id": 3, "tasks": ["2.11", "2.12", "2.13", "2.14"] },
    { "id": 4, "tasks": ["3.1", "3.2", "3.3"] },
    { "id": 5, "tasks": ["4.1", "4.2", "4.3", "4.4"] },
    { "id": 6, "tasks": ["4.5", "4.6", "4.7", "4.8"] },
    { "id": 7, "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.8"] },
    { "id": 8, "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "6.7", "6.8", "6.9"] },
    { "id": 9, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "7.7", "7.8", "7.9", "7.10"] },
    { "id": 10, "tasks": ["8.1"] },
    { "id": 11, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6", "9.7"] },
    { "id": 12, "tasks": ["10.1", "10.2", "10.3", "10.4", "10.5"] },
    { "id": 13, "tasks": ["11.1", "11.2", "11.3", "11.4", "11.5", "11.6", "11.7", "11.8", "11.9"] },
    { "id": 14, "tasks": ["12.1", "12.2", "12.3", "12.4", "12.5", "12.6", "12.7", "12.8", "12.9"] },
    { "id": 15, "tasks": ["13.1", "13.2", "13.3", "13.4", "13.5", "13.6", "13.7", "13.8", "13.9"] },
    { "id": 16, "tasks": ["14.1", "14.2", "14.3", "14.4", "14.5"] },
    { "id": 17, "tasks": ["15"] }
  ]
}
```
