# Requirements Document

## Introduction

This feature enables tour operators to edit and update tour packages they have created in the DAET-CONNECT.PH tourism management system. Operators need the ability to modify package details, pricing, itineraries, gallery images, and inclusions after initial creation, with appropriate restrictions based on package approval status.

## Feature Overview

For more details about this operator edit package feature, see the requirements below.

## Glossary

- **Operator**: A tourism business entity registered and approved in the system with an account role of "operator" and accreditation status of "approved"
- **Package**: A tour package offering created by an Operator, containing all details about a tour product (title, description, pricing, itinerary, etc.)
- **Package Status**: The current state of a package - one of: draft, pending_review, published, archived, or rejected
- **Package Ownership**: Verified relationship where the authenticated Operator owns the Package through their Operator profile
- **Edit Mode**: The interface state where an Operator can modify Package details
- **Field Restriction**: A Package field that is locked against modification due to Package status or business logic
- **Rejection Reason**: Feedback text provided by Admin when a Package is rejected, explaining why it was not approved
- **Tourism Office**: The admin role responsible for reviewing and approving submitted packages
- **Save Draft**: Action to persist Package changes without submitting for review
- **Submit for Review**: Action to save Package changes and move status from draft to pending_review
- **Package_Price_Variants**: Pricing configuration options with min/max pax and price values
- **Package_Inclusions**: List of items/services included or excluded from the package
- **Package_Stops**: The itinerary stops/locations that make up the tour experience
- **Package_Gallery**: Collection of images associated with the package

## Requirements

### Requirement 1: Access and Authentication

**User Story:** As an operator, I want to edit my packages only, so that I can manage my tour offerings and ensure security of my business information.

#### Acceptance Criteria

1. WHEN an unauthenticated user attempts to access the package edit page THEN THE System SHALL redirect them to the login page with a return URL query parameter set to the edit URL
2. WHEN an authenticated user without the operator role attempts to access the package edit page THEN THE System SHALL return HTTP status 403 Forbidden with an error message stating "Access denied: operator role required"
3. WHEN an authenticated operator attempts to access the package edit page for a package where the operator_id field does NOT match their authenticated user ID THEN THE System SHALL return HTTP status 403 Forbidden with an error message stating "Access denied: you do not own this package"
4. WHEN an authenticated operator with accreditation_status = "approved" accesses the package edit page for their own package (operator_id matches authenticated user ID) THEN THE System SHALL load and display the edit form with all current package data pre-populated in the form fields

### Requirement 2: Package Status-Based Field Editing

**User Story:** As an operator, I want appropriate editing permissions based on my package status, so that I can make corrections while still maintaining Tourism Office review integrity.

#### Acceptance Criteria

1. WHEN a package has status = "draft" AND the authenticated operator_id matches the package operator_id THEN THE System SHALL enable editing of ALL package fields: title, location_name, description, duration_value, duration_type, cover_image_url, and related entities (price_variants, inclusions, stops, gallery)
2. WHEN a package has status = "pending_review" AND an operator attempts to edit any field THEN THE System SHALL return HTTP status 403 Forbidden with error message "Package is under review and cannot be edited" and display the form in read-only mode with all inputs disabled
3. WHEN a package has status = "published" THEN THE System SHALL enable editing of: title, location_name, description, duration_type, inclusion item text and status, gallery captions, and stop details (location_name, description, latitude, longitude), AND prevent editing of base pricing (the price_per_pax and flat_price fields in the default pricing variant marked as is_default = true)
4. WHEN a package has status = "rejected" AND the authenticated operator_id matches the package operator_id THEN THE System SHALL enable editing of ALL package fields (same as draft status)
5. WHEN a package has status = "archived" AND an operator attempts to edit any field THEN THE System SHALL return HTTP status 403 Forbidden with error message "Archived packages cannot be edited" and display the form in read-only mode

### Requirement 3: Edit Form - Basic Information

**User Story:** As an operator, I want to update basic package details like title, description, and location, so that I can keep my offering information current.

#### Acceptance Criteria

1. WHEN the edit form loads THEN THE System SHALL display the package title field pre-populated with the current title value and accept string input of minimum 3 characters and maximum 150 characters
2. WHEN an Operator modifies the title field with text shorter than 3 characters or longer than 150 characters THEN THE System SHALL reject the change with error message "Title must be between 3 and 150 characters"
3. WHEN the edit form loads THEN THE System SHALL display the package location_name field pre-populated with the current location_name value and accept string input of minimum 2 characters and maximum 100 characters
4. WHEN an Operator modifies the location_name field with text shorter than 2 characters or longer than 100 characters THEN THE System SHALL reject the change with error message "Location name must be between 2 and 100 characters"
5. WHEN the edit form loads THEN THE System SHALL display the package description field pre-populated with the current description value and accept string input of minimum 10 characters and maximum 3000 characters
6. WHEN an Operator modifies the description field with text shorter than 10 characters or longer than 3000 characters THEN THE System SHALL reject the change with error message "Description must be between 10 and 3000 characters"
7. WHEN the edit form loads THEN THE System SHALL display duration_value field (numeric input, minimum 0.5 maximum 365) and duration_type field (dropdown with options: "hours", "days") both pre-populated with current values
8. WHEN an Operator modifies the duration_value field with a number outside 0.5 to 365 range THEN THE System SHALL reject the change with error message "Duration must be between 0.5 and 365"
9. WHEN the "Save as Draft" button is clicked on a draft or rejected package THEN THE System SHALL validate all modified basic information fields and if all validation passes then persist the changes to tours_packages table and display success message "Package saved successfully"
10. IF validation fails during save THEN THE System SHALL display validation error messages next to affected fields and NOT persist any changes

### Requirement 4: Edit Form - Cover Image

**User Story:** As an operator, I want to update my package's cover image, so that I can refresh how my package appears to tourists.

#### Acceptance Criteria

1. WHEN the edit form loads and the package has an existing cover_image_url value THEN THE System SHALL display a preview of the cover image with image dimensions shown as "width x height pixels" and a button labeled "Upload New Image"
2. WHEN the edit form loads and the package has a null or empty cover_image_url THEN THE System SHALL display a placeholder image with text "No cover image selected" and a button labeled "Upload Image"
3. WHEN an Operator clicks "Upload Image" or "Upload New Image" button THEN THE System SHALL open a file input dialog that accepts only image files with extensions: jpg, jpeg, png, webp
4. IF an Operator attempts to upload an image file with an unsupported format THEN THE System SHALL display error message "Only JPG, PNG, and WEBP formats are supported" and reject the file
5. IF an Operator uploads an image file larger than 5MB THEN THE System SHALL display error message "Image file size must not exceed 5MB" and reject the file
6. WHEN a valid image file is uploaded THEN THE System SHALL store it in the system's image storage and update the cover_image_url in tours_packages table and display success message "Cover image updated successfully"

### Requirement 5: Edit Form - Pricing Variants

**User Story:** As an operator, I want to manage pricing options with different participant minimums and maximums, so that I can offer flexible pricing for different group sizes.

#### Acceptance Criteria

1. WHEN the edit form loads THEN THE System SHALL display all existing package_price_variants in a table/list with columns: variant_name, min_pax, max_pax, price_per_pax, flat_price, is_default, and action buttons (Edit, Delete)
2. WHEN a package is in draft status AND the Operator clicks "Add Variant" THEN THE System SHALL display a form to create a new pricing variant with fields: variant_name, min_pax (1–10,000), max_pax (1–10,000), price_per_pax (0.01–999,999.99), flat_price (0.01–999,999.99), is_default checkbox
3. WHEN a pricing variant is submitted with min_pax > max_pax THEN THE System SHALL reject the save with error message "Minimum participants cannot be greater than maximum participants"
4. WHEN a pricing variant is submitted with price_per_pax or flat_price outside the range 0.01–999,999.99 THEN THE System SHALL reject the save with error message "Price must be between 0.01 and 999,999.99"
5. WHEN an Operator sets is_default = true on a pricing variant AND another variant already has is_default = true THEN THE System SHALL automatically set the previously default variant's is_default to false, ensuring only one default variant exists per package
6. WHEN a package is in published status AND the Operator attempts to add a new pricing variant THEN THE System SHALL disable the "Add Variant" button and display message "Cannot add variants to published packages"
7. WHEN a package is in published status AND the Operator attempts to delete an existing pricing variant THEN THE System SHALL disable the Delete button for all variants and display message "Cannot delete variants from published packages"
8. WHEN a package is in published status AND the Operator edits an existing pricing variant THEN THE System SHALL allow editing of min_pax and max_pax fields only; all other fields (variant_name, price_per_pax, flat_price, is_default) SHALL be displayed as read-only

### Requirement 6: Edit Form - Inclusions

**User Story:** As an operator, I want to manage what is included and not included in my package, so that tourists have clear expectations about the offering.

#### Acceptance Criteria

1. WHEN the edit form loads THEN THE System SHALL display all existing package_inclusions in two sections: "Inclusions" (where is_included = true) and "Exclusions" (where is_included = false), with columns: item_text, checkbox to toggle is_included status, display_order number, and action buttons (Edit, Delete)
2. WHEN the edit form loads THEN THE System SHALL verify the package has at least one inclusion item (is_included = true); if zero inclusions exist then display warning message "Package must have at least one inclusion"
3. WHEN a package is in draft status AND the Operator clicks "Add Inclusion" THEN THE System SHALL display an input field accepting text of 1–500 characters and a dropdown to select is_included status (Included or Excluded)
4. WHEN an Operator submits a new inclusion item with text longer than 500 characters THEN THE System SHALL reject the save with error message "Item text cannot exceed 500 characters"
5. WHEN a package has 50 existing inclusion items AND an Operator attempts to add a new item THEN THE System SHALL reject the add with error message "Maximum 50 items allowed per package"
6. WHEN a package is in draft status THEN THE System SHALL allow the Operator to edit existing inclusion item text and toggle the is_included status
7. WHEN a package is in draft status THEN THE System SHALL allow the Operator to delete inclusion items
8. WHEN a package is in draft status THEN THE System SHALL allow the Operator to reorder inclusion items using numbered display_order fields or drag-and-drop interface
9. WHEN a package is in published status AND the Operator edits an inclusion item THEN THE System SHALL allow editing of item_text and is_included toggle only; deletion and reordering SHALL be disabled with message "Cannot delete or reorder items in published packages"
10. WHEN inclusion items are saved THEN THE System SHALL persist the display_order values to maintain the updated sequence in tours_package_inclusions table

### Requirement 7: Edit Form - Itinerary Stops

**User Story:** As an operator, I want to manage the itinerary stops and locations, so that I can provide detailed tour information to potential tourists.

#### Acceptance Criteria

1. WHEN the edit form loads THEN THE System SHALL display all existing package_stops sorted by stop_order in ascending order in a table/list with columns: stop_order (numbered input field), location_name, description, latitude, longitude, and action buttons (Edit, Delete)
2. WHEN the edit form loads THEN THE System SHALL display a "Reorder Stops" section with numbered input fields (1, 2, 3, ..., N) for each stop, or a drag-and-drop interface to reorder stops by stop_order
3. WHEN a package is in draft status AND the Operator clicks "Add Stop" THEN THE System SHALL display a form with required fields: location_name (string, 2–100 chars), description (string, 10–1000 chars), latitude (number, -90 to 90), longitude (number, -180 to 180)
4. WHEN an Operator submits a new stop without a location_name value THEN THE System SHALL reject the save with error message "Location name is required"
5. WHEN a package has 50 existing stops AND an Operator attempts to add a new stop THEN THE System SHALL reject the add with error message "Maximum 50 stops allowed per package"
6. WHEN a package is in draft status THEN THE System SHALL allow the Operator to edit existing stop details (location_name, description, latitude, longitude)
7. WHEN a package is in draft status THEN THE System SHALL allow the Operator to delete stops AND display a confirmation dialog asking "Are you sure you want to delete this stop?"
8. WHEN a package is in draft status THEN THE System SHALL allow the Operator to reorder stops by modifying the stop_order numbered input field
9. WHEN a package is in published status AND the Operator attempts to add a new stop THEN THE System SHALL disable the "Add Stop" button and display message "Cannot add stops to published packages"
10. WHEN a package is in published status AND the Operator attempts to delete an existing stop THEN THE System SHALL disable the Delete button for all stops and display message "Cannot delete stops from published packages"
11. WHEN a package is in published status AND the Operator attempts to reorder stops by modifying stop_order THEN THE System SHALL display message "Cannot reorder stops in published packages" and prevent the change
12. WHEN a package is in published status AND the Operator edits an existing stop THEN THE System SHALL allow editing of location_name, description, latitude, and longitude fields
13. WHEN stops are saved THEN THE System SHALL persist all modified stop_order values to maintain the updated sequence in tours_package_stops table

### Requirement 8: Edit Form - Gallery Images

**User Story:** As an operator, I want to manage gallery images for my package, so that I can showcase multiple aspects of the tour experience.

#### Acceptance Criteria

1. WHEN the edit form loads THEN THE System SHALL display all existing package_gallery images sorted by display_order in ascending order in a grid or list with columns: thumbnail preview (100x100 pixels), caption, display_order number, and action buttons (Edit caption, Delete, Reorder)
2. WHEN a package is in draft status AND the Operator clicks "Add Image" THEN THE System SHALL open a file input dialog that accepts only image files with extensions: jpg, jpeg, png, webp, and displays a text field for caption (0–500 characters)
3. IF an Operator attempts to upload an image file with an unsupported format THEN THE System SHALL display error message "Only JPG, PNG, and WEBP formats are supported" and reject the file
4. IF an Operator uploads an image file larger than 5MB THEN THE System SHALL display error message "Image file size must not exceed 5MB" and reject the file
5. WHEN a package has 20 existing gallery images AND an Operator attempts to add a new image THEN THE System SHALL reject the add with error message "Maximum 20 images allowed per package"
6. WHEN a package is in draft status THEN THE System SHALL allow the Operator to edit gallery image captions (0–500 characters)
7. WHEN a package is in draft status THEN THE System SHALL allow the Operator to delete gallery images AND display a confirmation dialog asking "Are you sure you want to delete this image?"
8. WHEN a package is in draft status THEN THE System SHALL allow the Operator to reorder gallery images using numbered display_order fields or drag-and-drop interface
9. WHEN a package is in published status AND the Operator attempts to add a new gallery image THEN THE System SHALL disable the "Add Image" button and display message "Cannot add images to published packages"
10. WHEN a package is in published status AND the Operator attempts to delete a gallery image THEN THE System SHALL disable the Delete button for all images and display message "Cannot delete images from published packages"
11. WHEN a package is in published status AND the Operator attempts to reorder gallery images THEN THE System SHALL display message "Cannot reorder images in published packages" and prevent the change
12. WHEN a package is in published status AND the Operator edits an existing gallery image THEN THE System SHALL allow editing of the caption field only; image file and display_order SHALL be read-only
13. WHEN gallery images are saved THEN THE System SHALL persist all modified display_order values to maintain the updated sequence in tours_package_gallery table

### Requirement 9: Rejection Reason Display

**User Story:** As an operator, I want to see why my package was rejected, so that I can address the admin feedback and resubmit.

#### Acceptance Criteria

1. WHEN a package with status = "rejected" loads in edit mode THEN THE System SHALL display the rejection_reason value in a prominent notice box at the top of the edit form with background color red, text color white, and header "Rejection Reason:"
2. WHEN a package with status = "rejected" loads in edit mode THEN THE System SHALL display the rejection_reason text truncated to 1000 characters with ellipsis if the actual reason exceeds 1000 characters
3. WHEN a package with status = "rejected" loads in edit mode AND the rejection_reason field is null or empty THEN THE System SHALL display the notice box with text "No rejection reason provided by admin"
4. WHEN a package with status = "rejected" AND an Operator modifies any package field THEN THE System SHALL enable the "Submit for Review" button so they can resubmit after addressing feedback
5. WHEN an Operator successfully resubmits a rejected package for review THEN THE System SHALL change the status to "pending_review", clear the rejection_reason field, update updated_at timestamp, and display success message "Package resubmitted for review successfully"

### Requirement 10: Save and Submit Actions

**User Story:** As an operator, I want to save my package changes as a draft or submit for review, so that I can work on packages incrementally or send them for approval.

#### Acceptance Criteria

1. WHEN a package is in draft status AND the Operator has made any changes to form fields (title, description, location_name, duration_value, duration_type, cover_image_url, or related entities) that differ from the current database values THEN THE System SHALL enable the "Save as Draft" button and "Submit for Review" button
2. WHEN a package is in draft status AND no changes have been made from the current database values THEN THE System SHALL disable both "Save as Draft" and "Submit for Review" buttons
3. WHEN an Operator clicks "Save as Draft" on a draft or rejected package THEN THE System SHALL validate required fields: title, location_name, description, duration_value, duration_type, cover_image_url, at least one pricing variant, at least one inclusion, at least one stop
4. IF any required field is missing or fails validation THEN THE System SHALL display error message "Please fix the following errors before saving:" followed by a bulleted list of field-specific error messages (e.g., "Title: Required field", "Price variant: Minimum price must not be negative")
5. IF validation passes THEN THE System SHALL persist all changes to the database (tours_packages, tours_package_price_variants, tours_package_inclusions, tours_package_stops, tours_package_gallery tables), update updated_at to current server timestamp, and display success message "Package saved successfully" for 2–3 seconds then auto-dismiss
6. WHEN a save operation completes successfully THEN THE System SHALL remain on the edit page with all form fields still populated with the saved values
7. WHEN an Operator clicks "Submit for Review" on a draft or rejected package THEN THE System SHALL validate the same required fields as "Save as Draft"
8. IF validation fails THEN THE System SHALL display the same field-specific error messages and NOT change the package status
9. IF validation passes THEN THE System SHALL persist all changes, update status to "pending_review", update updated_at to current server timestamp, display success message "Package submitted for review successfully" for 2–3 seconds, then redirect to the package details page
10. WHEN the "Submit for Review" button is clicked AND another user modified the package concurrently (updated_at timestamp in database differs from the form's cached updated_at) THEN THE System SHALL return HTTP 409 Conflict and display error message "This package was modified by another user. Please reload the page to see the latest changes."

### Requirement 11: Edit URL and Navigation

**User Story:** As an operator, I want a dedicated edit URL for packages, so that I can bookmark and share edit links.

#### Acceptance Criteria

1. THE System SHALL provide an edit page at the URL path `/tours/operator/packages/{packageId}/edit` where `{packageId}` is the numeric package ID from the tours_packages table
2. WHEN an unauthenticated or unauthorized user (not the package owner) accesses the edit URL THEN THE System SHALL return HTTP status 403 Forbidden and NOT display the edit form
3. WHEN an authorized Operator accesses the edit URL for a package that does NOT exist in the database THEN THE System SHALL return HTTP status 404 Not Found and display error message "Package not found"
4. WHEN an Operator is viewing a package detail page and the package owner_id matches their authenticated user ID THEN THE System SHALL display an "Edit package" button/link that navigates to the edit URL
5. WHEN an Operator accesses the edit URL THEN THE System SHALL load all package data from the database and pre-populate all form fields: title, location_name, description, duration_value, duration_type, cover_image_url, pricing variants, inclusions, stops, and gallery images

### Requirement 12: Error Handling and Validation

**User Story:** As an operator, I want clear error messages when something goes wrong, so that I can fix issues and successfully save my changes.

#### Acceptance Criteria

1. THE System SHALL define these required fields for package save: title, location_name, description, duration_value, duration_type, at least one pricing variant with all required fields (variant_name, min_pax, max_pax, price_per_pax or flat_price), at least one inclusion item, at least one stop with location_name
2. IF a required field is empty or missing THEN THE System SHALL display an error message next to that field with format "FieldName: This field is required" and not persist changes
3. WHEN field input exceeds character/value limits (title: 150 chars max, location_name: 100 chars max, description: 3000 chars max, item_text: 500 chars max, caption: 500 chars max) THEN THE System SHALL display error message with format "FieldName: Maximum length is N characters" and not persist changes
4. WHEN pricing validation fails with specific constraints (min_pax > max_pax, price outside 0.01–999,999.99, min_pax outside 1–10,000, max_pax outside 1–10,000) THEN THE System SHALL display specific error message for that field (e.g., "Min_pax: Must be between 1 and 10,000")
5. WHEN the package data cannot be loaded from the database (due to package not found, database error, or permission issue) THEN THE System SHALL display error message "Unable to load package data. Please try again later." and not display the edit form
6. WHEN a save or submit operation fails (due to database error, network error, or server error) THEN THE System SHALL display error message "Failed to save package. Please try again." and preserve all form data in the UI so the operator doesn't lose their changes
7. WHEN another user modifies the package concurrently while being edited (detected via updated_at timestamp mismatch on save attempt) THEN THE System SHALL handle the conflict gracefully with error message "This package was modified by another user. Please reload the page to see the latest changes." and not persist the changes

### Requirement 13: Optimistic UI Updates and Feedback

**User Story:** As an operator, I want responsive feedback when I save changes, so that I can see that my actions are being processed.

#### Acceptance Criteria

1. WHEN an Operator clicks "Save as Draft" or "Submit for Review" button THEN THE System SHALL immediately disable all form input fields (text inputs, textareas, dropdowns, file inputs, buttons) and display a loading indicator (spinner or progress bar) overlaying the form
2. WHEN a save operation completes successfully THEN THE System SHALL display a success message "Package saved successfully" for 2–3 seconds in a toast notification or banner at the top of the form, then auto-dismiss the message
3. WHEN a save operation completes successfully AND the button clicked was "Submit for Review" THEN THE System SHALL display the success message "Package submitted for review successfully" for 2–3 seconds, then redirect to the package details page
4. WHEN a save operation fails (returns error from server) THEN THE System SHALL remove the loading indicator, re-enable all form inputs, and display an error message "Failed to save package. Please try again." in a toast or banner at the top of the form; the error message SHALL persist until the user dismisses it or makes another save attempt
5. WHEN a save operation fails THEN THE System SHALL preserve all form data in the inputs so the operator can see their changes and retry saving without data loss

### Requirement 14: Persistence and Data Consistency

**User Story:** As an operator, I want my package changes to be saved correctly and consistently, so that the system reflects the current state of my offerings.

#### Acceptance Criteria

1. WHEN a "Save as Draft" or "Submit for Review" operation is initiated THEN THE System SHALL treat all database operations as a single atomic transaction: all changes to tours_packages, tours_package_price_variants, tours_package_inclusions, tours_package_stops, and tours_package_gallery tables SHALL either all succeed or all rollback together
2. WHEN an Operator saves a package with modifications THEN THE System SHALL persist all changes to the corresponding database tables exactly as submitted in the form, with no silent modifications
3. WHEN related entities (pricing variants, inclusions, stops, gallery images) are deleted by the operator THEN THE System SHALL delete the corresponding database records from tours_package_price_variants, tours_package_inclusions, tours_package_stops, or tours_package_gallery tables respectively
4. WHEN a package is updated THEN THE System SHALL update the updated_at timestamp field in tours_packages table to the current server time in UTC with millisecond precision (e.g., 2024-01-15T14:30:45.123Z)
5. WHEN a successful save operation completes THEN THE System SHALL return HTTP status 200 OK with a JSON response containing: { "success": true, "message": "Package saved", "updatedAt": "timestamp" }
6. WHEN a save operation fails due to database error or validation error THEN THE System SHALL return an appropriate HTTP error status (400 for validation, 500 for server error) with JSON response containing: { "success": false, "message": "error message", "errors": { "fieldName": "specific error" } }
7. WHEN concurrent save requests are made to the same package by different operators THEN THE System SHALL ensure the second request checks the updated_at timestamp and reject with HTTP 409 Conflict if the database record has been modified since the form was loaded
8. IF a concurrency conflict is detected THEN THE System SHALL display error message "This package was modified by another user. Please reload the page to see the latest changes." and NOT persist any changes from the current request

