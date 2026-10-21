"use server";

import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { isUuid } from "@/lib/tours/operator-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PACKAGE_DETAIL_SELECT,
  PACKAGE_FIELDS,
  PACKAGE_LIST_SELECT,
  PACKAGE_STATUS,
  PACKAGE_TABLE,
  PACKAGE_STORAGE_BUCKET,
  PRICE_VARIANT_FIELDS,
  PRICE_VARIANT_TABLE,
  STOP_FIELDS,
  STOP_TABLE,
  type PackageDetailRecord,
  type PackageStatus,
  type PriceVariantInput,
  type PackageStopInput,
  type PriceVariantRecord,
  type PackageStopRecord,
} from "@/lib/tours/package-contract";
import { OPERATOR_TABLE } from "@/lib/tours/operator-contract";
import {
  validatePackageFormData,
  validatePricingVariants,
  validateInclusions,
  validateStops,
  validateGalleryImages,
} from "./validation-utils";
import type { EditPackageRecord } from "./edit-types";

type SessionClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const OPERATOR_PROFILE_ID_COLUMN = "profile_id";

/**
 * Result type for requirePackageOwnership helper.
 * 
 * Returns either:
 * - error object with status code (404 or 403)
 * - data object with package ownership details
 */
interface RequirePackageOwnershipResult {
  packageId: string;
  operatorId: string;
  status: PackageStatus;
}

/**
 * Result type for authentication helper.
 * 
 * Returns either:
 * - error object with status code (401 or 403) and message
 * - data object with authenticated session info
 */
interface AuthenticatedSessionResult {
  operatorId: string;
  userId: string;
}

/**
 * Result type for requireEditablePackageStatus helper.
 * 
 * Returns either:
 * - error object with status code (403) and status-specific message
 * - data object with editability flag, status, and optional allowed/restricted field lists
 */
interface EditablePackageStatusResult {
  isEditable: true;
  status: PackageStatus;
  allowedFields?: string[];
  restrictedFields?: string[];
}

/**
 * Server action response result type.
 * 
 * Used for all save/submit operations to provide consistent feedback.
 */
interface UpdatePackageResponse {
  success: boolean;
  message: string;
  error?: string;
  errors?: Record<string, string>;
  updatedAt?: string;
  data?: {
    packageId: string;
    status: PackageStatus;
  };
}

/**
 * Input type for package form data with related entities.
 * 
 * This represents the complete package edit form state before server-side normalization.
 */
interface EditPackageFormInput {
  title: string;
  description: string | null;
  locationName: string;
  durationValue: number;
  durationType: "hours" | "days";
  coverImageUrl: string | null;
  priceVariants: PriceVariantInput[];
  inclusions: Array<{
    id?: string;
    text: string;
    isIncluded: boolean;
    displayOrder: number;
  }>;
  stops: PackageStopInput[];
  galleryImages: Array<{
    id?: string;
    imageUrl: string;
    caption: string | null;
    displayOrder: number;
  }>;
}

/**
 * Async helper function to verify user authentication and operator status.
 * 
 * Purpose:
 * - Verifies user session exists and is authenticated
 * - Verifies user has operator role
 * - Verifies operator profile is approved
 * - Returns authenticated operator details on success
 * 
 * This ensures only authenticated, approved operators can access editing features.
 * 
 * Parameters:
 * - sessionClient: Supabase server client for database queries
 * 
 * Returns:
 * - { error: { status: 401, message: string } } if not authenticated
 * - { error: { status: 403, message: string } } if not operator or not approved
 * - { data: AuthenticatedSessionResult } on success with operatorId and userId
 * 
 * Validates: Requirements 1.1-1.2 (authentication and operator verification)
 */
export async function requireAuthenticated(
  sessionClient: SessionClient,
): Promise<
  | { error: { status: 401; message: string } }
  | { error: { status: 403; message: string } }
  | { data: AuthenticatedSessionResult }
> {
  try {
    // Get the authenticated session (user + role)
    const session = await getAuthenticatedSession();

    // Check if user is authenticated (401 if not)
    if (session.error || !session.user) {
      return {
        error: {
          status: 401,
          message: "Authentication required. Please log in.",
        },
      };
    }

    // Check if user has operator role (403 if not)
    if (session.role !== "operator") {
      return {
        error: {
          status: 403,
          message: "Access denied: operator role required",
        },
      };
    }

    // Query the operator profile to verify it exists and is approved
    const { data: operator, error } = await sessionClient
      .from(OPERATOR_TABLE)
      .select("id,accreditation_status")
      .eq(OPERATOR_PROFILE_ID_COLUMN, session.user.id)
      .maybeSingle();

    // Handle database error or missing operator profile
    if (error || !operator) {
      return {
        error: {
          status: 403,
          message: "Access denied: operator role required",
        },
      };
    }

    // Verify operator is approved (403 if not)
    if (operator.accreditation_status !== "approved") {
      return {
        error: {
          status: 403,
          message:
            "Access denied: your operator account must be approved to edit packages",
        },
      };
    }

    // Return authenticated operator details on success
    return {
      data: {
        operatorId: operator.id as string,
        userId: session.user.id,
      },
    };
  } catch (error) {
    // Treat unexpected errors as 401 (not authenticated)
    return {
      error: {
        status: 401,
        message: "Authentication required. Please log in.",
      },
    };
  }
}

/**
 * Async helper function that verifies operator ownership of a package.
 * 
 * Purpose:
 * - Queries the tours_packages table for the given packageId
 * - Returns 404 if package not found
 * - Returns 403 if operator doesn't own the package (operator_id mismatch)
 * - Returns the package record (with id, operator_id, status) on success
 * 
 * This ensures operators can only edit packages they created.
 * 
 * Validates: Requirements 1.3-1.4 (access control & ownership verification)
 */
export async function requirePackageOwnership(
  sessionClient: SessionClient,
  packageId: string,
  operatorId: string,
): Promise<
  | { error: { status: 404; message: string } }
  | { error: { status: 403; message: string } }
  | { data: RequirePackageOwnershipResult }
> {
  // Validate packageId format before querying database
  if (!isUuid(packageId)) {
    return {
      error: { status: 404, message: "Package not found." },
    };
  }

  try {
    // Query the package from the database with required fields
    const { data: pkg, error } = await sessionClient
      .from(PACKAGE_TABLE)
      .select("id,operator_id,status")
      .eq("id", packageId)
      .maybeSingle();

    // Handle database errors or missing package (404)
    if (error || !pkg) {
      return {
        error: { status: 404, message: "Package not found." },
      };
    }

    // Verify operator ownership by comparing operator_id (403 if mismatch)
    if (pkg.operator_id !== operatorId) {
      return {
        error: {
          status: 403,
          message: "Access denied: you do not own this package",
        },
      };
    }

    // Return the package record on success with all required fields
    return {
      data: {
        packageId: pkg.id as string,
        operatorId: pkg.operator_id as string,
        status: pkg.status as PackageStatus,
      },
    };
  } catch (error) {
    // Treat unexpected errors as 404 for security (no information disclosure)
    return {
      error: { status: 404, message: "Package not found." },
    };
  }
}

/**
 * Helper function to check if a package's status allows editing of specific fields.
 * 
 * Purpose:
 * - Verifies package status permits field edits
 * - For draft and rejected: all fields are editable (returns no error)
 * - For published: only specific fields allowed; check fieldsBeingEdited against allowed list
 * - For pending_review/archived: no fields editable (returns 403 forbidden)
 * - Returns status-specific error messages
 * 
 * Behavior:
 * - Status "draft": Always allows editing (all fields editable)
 * - Status "rejected": Always allows editing (all fields editable)
 * - Status "published": Allows editing only if fieldsBeingEdited is within allowed list
 *   - Allowed fields: title, locationName, description, durationType, inclusionItemText, 
 *     inclusionToggle, galleryCaption, stopLocationName, stopDescription, stopLatitude, stopLongitude
 *   - Restricted fields: adding/deleting/reordering variants, stops, or gallery; editing pricing
 * - Status "pending_review": Blocks all edits with message "Package is under review and cannot be edited"
 * - Status "archived": Blocks all edits with message "Archived packages cannot be edited"
 * 
 * Parameters:
 * - packageStatus: The current status of the package (from database)
 * - fieldsBeingEdited: (optional) Array of field names being modified. Used for published packages
 *   to verify only allowed fields are changed. If empty/undefined and status is published, 
 *   assumes no editable fields and returns error.
 * 
 * Returns:
 * - { error: { status: 403, message: string } } if package cannot be edited
 * - { data: { isEditable: true, allowedFields?: string[], restrictedFields?: string[] } } if editable
 * 
 * Validates: Requirements 2.1-2.5 (status-based field editing restrictions)
 */
export async function requireEditablePackageStatus(
  packageStatus: PackageStatus,
  fieldsBeingEdited?: string[],
): Promise<
  | { error: { status: 403; message: string } }
  | { data: { isEditable: true; status: PackageStatus; allowedFields?: string[]; restrictedFields?: string[] } }
> {
  // For draft and rejected statuses: all fields are editable without restriction
  if (packageStatus === "draft" || packageStatus === "rejected") {
    return {
      data: {
        isEditable: true,
        status: packageStatus,
      },
    };
  }

  // For pending_review status: no fields can be edited
  if (packageStatus === "pending_review") {
    return {
      error: {
        status: 403,
        message: "Package is under review and cannot be edited",
      },
    };
  }

  // For archived status: no fields can be edited
  if (packageStatus === "archived") {
    return {
      error: {
        status: 403,
        message: "Archived packages cannot be edited",
      },
    };
  }

  // For published status: only specific fields are editable
  if (packageStatus === "published") {
    const allowedFields = [
      "title",
      "locationName",
      "description",
      "durationType",
      "inclusionItemText",
      "inclusionToggle",
      "galleryCaption",
      "stopLocationName",
      "stopDescription",
      "stopLatitude",
      "stopLongitude",
    ];

    const restrictedOperations = [
      "addPriceVariant",
      "deletePriceVariant",
      "editPricePerPax",
      "editFlatPrice",
      "editVariantName",
      "editMinMaxPax",
      "addStop",
      "deleteStop",
      "reorderStops",
      "addGalleryImage",
      "deleteGalleryImage",
      "reorderGallery",
      "addInclusion",
      "deleteInclusion",
      "reorderInclusions",
    ];

    if (fieldsBeingEdited && fieldsBeingEdited.length > 0) {
      const invalidFields = fieldsBeingEdited.filter(
        (field) => !allowedFields.includes(field) && !restrictedOperations.includes(field)
      );

      const attemptedRestricted = fieldsBeingEdited.filter((field) =>
        restrictedOperations.includes(field)
      );

      if (attemptedRestricted.length > 0) {
        const fieldList = attemptedRestricted.slice(0, 2).join(", ");
        return {
          error: {
            status: 403,
            message: `Published packages cannot edit: ${fieldList}${
              attemptedRestricted.length > 2 ? " and more" : ""
            }`,
          },
        };
      }

      if (invalidFields.length > 0) {
        const fieldList = invalidFields.slice(0, 2).join(", ");
        return {
          error: {
            status: 403,
            message: `Published packages cannot edit: ${fieldList}${
              invalidFields.length > 2 ? " and more" : ""
            }`,
          },
        };
      }
    }

    return {
      data: {
        isEditable: true,
        status: packageStatus,
        allowedFields,
        restrictedFields: restrictedOperations,
      },
    };
  }

  return {
    error: {
      status: 403,
      message: "Invalid package status",
    },
  };
}

/**
 * Load complete package data for editing.
 * 
 * Purpose:
 * - Verify authentication and ownership
 * - Load from tours_packages, tours_package_price_variants, tours_package_inclusions,
 *   tours_package_stops, tours_package_gallery
 * - Normalize database format to form data structure
 * - Return complete package record with all relationships
 * 
 * Flow:
 * 1. Create Supabase server client
 * 2. Call requireAuthenticated to verify user is authenticated operator
 * 3. Call requirePackageOwnership to verify operator owns the package
 * 4. Load package from tours_packages with related tables
 * 5. Normalize database records to form data structure
 * 6. Return success with package data
 * 
 * Error Handling:
 * - 401: Not authenticated -> redirect to login
 * - 403: Not operator, not approved, or not owner -> access denied
 * - 404: Package not found -> not found error
 * - 500: Unexpected error during load
 * 
 * Validates: Requirements 3.9-3.10, 11.1-11.5
 */
export async function loadPackageForEdit(
  packageId: string
): Promise<
  | { success: true; data: EditPackageFormInput & {
      id: string;
      operatorId: string;
      status: PackageStatus;
      rejectionReason: string | null;
      createdAt: string;
      updatedAt: string;
    }}
  | { success: false; error: { status: 401 | 403 | 404 | 500; message: string } }
> {
  try {
    // Create Supabase server client for database queries
    const sessionClient = await createSupabaseServerClient();

    // Step 1: Verify authentication and get operator details
    const authResult = await requireAuthenticated(sessionClient);
    if (authResult.error) {
      return {
        success: false,
        error: {
          status: authResult.error.status,
          message: authResult.error.message,
        },
      };
    }

    const { operatorId } = authResult.data;

    // Step 2: Verify operator owns this package
    const ownershipResult = await requirePackageOwnership(
      sessionClient,
      packageId,
      operatorId
    );
    if (ownershipResult.error) {
      return {
        success: false,
        error: {
          status: ownershipResult.error.status,
          message: ownershipResult.error.message,
        },
      };
    }

    // Step 3: Load complete package with all related tables
    const { data: pkg, error: pkgError } = await sessionClient
      .from(PACKAGE_TABLE)
      .select(
        `id,
        operator_id,
        title,
        description,
        location_name,
        duration_value,
        duration_type,
        cover_image_url,
        status,
        rejection_reason,
        created_at,
        updated_at,
        ${PRICE_VARIANT_TABLE}(*),
        tours_package_inclusions(*),
        tours_package_stops(*),
        tours_package_gallery(*)`
      )
      .eq("id", packageId)
      .maybeSingle();

    // Handle database errors or missing package
    if (pkgError || !pkg) {
      return {
        success: false,
        error: {
          status: 404,
          message: "Package not found.",
        },
      };
    }

    // Step 4: Normalize database records to form data structure
    const priceVariants = (
      pkg[PRICE_VARIANT_TABLE] as unknown as PriceVariantRecord[]
    )
      .sort((a, b) => (a.is_default ? -1 : 1)) // Put default variant first
      .map((variant) => ({
        id: variant.id,
        variantName: variant.variant_name,
        minPax: variant.min_pax,
        maxPax: variant.max_pax,
        pricePerPax: variant.price_per_pax,
        flatPrice: variant.flat_price,
        isDefault: variant.is_default,
      }));

    const inclusions = (
      pkg["tours_package_inclusions"] as unknown as Array<{
        id: string;
        item_text: string;
        is_included: boolean;
        display_order: number;
      }>
    )
      .sort((a, b) => a.display_order - b.display_order)
      .map((inclusion) => ({
        id: inclusion.id,
        text: inclusion.item_text,
        isIncluded: inclusion.is_included,
        displayOrder: inclusion.display_order,
      }));

    const stops = (
      pkg["tours_package_stops"] as unknown as PackageStopRecord[]
    )
      .sort((a, b) => a.stop_order - b.stop_order)
      .map((stop) => ({
        id: stop.id,
        locationName: stop.location_name,
        description: stop.description,
        latitude: stop.latitude,
        longitude: stop.longitude,
        estimatedDurationMinutes: stop.estimated_duration_minutes,
      }));

    const galleryImages = (
      pkg["tours_package_gallery"] as unknown as Array<{
        id: string;
        image_url: string;
        caption: string | null;
        display_order: number;
      }>
    )
      .sort((a, b) => a.display_order - b.display_order)
      .map((image) => ({
        id: image.id,
        imageUrl: image.image_url,
        caption: image.caption,
        displayOrder: image.display_order,
      }));

    // Separate inclusions and exclusions
    const inclusionItems = inclusions.filter((i) => i.isIncluded);
    const exclusionItems = inclusions.filter((i) => !i.isIncluded);

    // Step 5: Return success with complete normalized package data
    return {
      success: true,
      data: {
        id: pkg.id,
        status: pkg.status,
        rejectionReason: pkg.rejection_reason,
        updatedAt: pkg.updated_at,
        formData: {
          title: pkg.title,
          description: pkg.description,
          locationName: pkg.location_name,
          durationValue: pkg.duration_value,
          durationType: pkg.duration_type,
          coverImageUrl: pkg.cover_image_url,
          priceVariants,
          inclusions: inclusionItems,
          exclusions: exclusionItems,
          stops,
          galleryImages,
        },
      } as { success: true; data: EditPackageRecord },
    };
  } catch (error) {
    // Log unexpected errors (for debugging)
    console.error("Error in loadPackageForEdit:", error);

    // Return generic error response
    return {
      success: false,
      error: {
        status: 500,
        message: "Unable to load package data. Please try again later.",
      },
    };
  }
}



/**
 * NOTE: validatePricingVariants has been moved to validation-utils.ts
 * It is imported from there at the top of this file.
 * Do not re-export it from here as the "use server" directive requires all exports to be async.
 */


/**
 * Validate inclusions/exclusions array.
 * 
 * Purpose:
 * - Check at least one inclusion (is_included = true) exists
 * - Check max 50 items total
 * - Validate item_text: 1-500 chars per item
 * - Verify display_order unique and sequential
 * 
 * Parameters:
 * - inclusions: Array of inclusion/exclusion objects to validate
 * 
 * Returns:
 * - { valid: true, errors: {} } if all validations pass
 * - { valid: false, errors: { fieldName: "error message", ... } } if any validation fails
/**
 * NOTE: validateInclusions has been moved to validation-utils.ts
 * It is imported from there at the top of this file.
 * Do not re-export it from here as the "use server" directive requires all exports to be async.
 */


/**
 * Validate stops array.
 * 
 * Purpose:
 * - Check at least one stop exists
 * - Check max 50 stops total
 * - Validate location_name: 2-100 chars, required
 * - Validate description: 10-1000 chars if provided
 * - Validate latitude: -90 to 90, required
 * - Validate longitude: -180 to 180, required
 * - Verify stop_order unique and sequential
 * 
 * Parameters:
 * - stops: Array of stop objects to validate
 * 
 * Returns:
 * - { valid: true, errors: {} } if all validations pass
 * - { valid: false, errors: { fieldName: "error message", ... } } if any validation fails
 * 
/**
 * NOTE: validateStops has been moved to validation-utils.ts
 * It is imported from there at the top of this file.
 * Do not re-export it from here as the "use server" directive requires all exports to be async.
 */


/**
 * Validate gallery images array.
 * 
 * Purpose:
 * - Check max 20 images total
 * - Validate caption: 0-500 chars if provided
 * - Verify display_order unique and sequential
 * 
 * Parameters:
 * - images: Array of gallery image objects to validate
 * 
 * Returns:
 * - { valid: true, errors: {} } if all validations pass
 * - { valid: false, errors: { fieldName: "error message", ... } } if any validation fails
 * 
 * Validates: Requirements 8.1-8.13, 12.1-12.7
 * 
 * NOTE: This function has been moved to validation-utils.ts
 * This is left here as a placeholder for reference only - it's no longer exported from here
 */
// Function moved to validation-utils.ts

/**
 * Update package core fields and all related tables.
 * 
 * Purpose:
 * - Call requireAuthenticated, requirePackageOwnership, requireEditablePackageStatus
 * - Validate form data (basic info, pricing, inclusions, stops, gallery)
 * - Check concurrency via updated_at timestamp
 * - Call update_package_and_relations RPC with normalized form data
 * - Handle errors: 409 conflict, 400 validation, 500 database
 * 
 * Flow:
 * 1. Create Supabase server client
 * 2. Verify authentication (401 if not)
 * 3. Verify ownership (403 if not owner)
 * 4. Verify editable status (403 if not editable)
 * 5. Validate form data using all validation functions
 * 6. If validation fails, return 400 with field-specific errors
 * 7. Check concurrency: call concurrency_check RPC, return 409 if mismatch
 * 8. Call update_package_and_relations RPC with normalized form data
 * 9. If RPC succeeds, return 200 with success flag and updatedAt
 * 10. If RPC fails with database error, return 500
 * 
 * Error Handling:
 * - 401: Not authenticated
 * - 403: Not approved, not owner, or status prevents editing
 * - 400: Validation errors (return field-specific errors)
 * - 409: Concurrency conflict (cachedUpdatedAt mismatch)
 * - 500: Unexpected database error
 * 
 * Validates: Requirements 3.9-3.10, 10.1-10.10, 14.1-14.8
 */
export async function updatePackageCore(
  packageId: string,
  formData: EditPackageFormInput,
  cachedUpdatedAt: string,
): Promise<UpdatePackageResponse> {
  try {
    // Step 1: Create Supabase server client
    const sessionClient = await createSupabaseServerClient();

    // Step 2: Verify authentication and get operator details
    const authResult = await requireAuthenticated(sessionClient);
    if ("error" in authResult) {
      return {
        success: false,
        message: authResult.error.message,
        error: authResult.error.message,
        errors: {},
      };
    }

    const { operatorId } = authResult.data;

    // Step 3: Verify operator owns this package and get package status
    const ownershipResult = await requirePackageOwnership(
      sessionClient,
      packageId,
      operatorId
    );
    if ("error" in ownershipResult) {
      return {
        success: false,
        message: ownershipResult.error.message,
        error: ownershipResult.error.message,
        errors: {},
      };
    }

    const { status: packageStatus } = ownershipResult.data;

    // Step 4: Verify package status allows editing
    const editabilityResult = await requireEditablePackageStatus(
      packageStatus
    );
    if ("error" in editabilityResult) {
      return {
        success: false,
        message: editabilityResult.error.message,
        error: editabilityResult.error.message,
        errors: {},
      };
    }

    // Step 5: Validate form data using all validation functions
    const packageValidation = validatePackageFormData(formData);
    const pricingValidation = validatePricingVariants(formData.priceVariants);
    const inclusionsValidation = validateInclusions(formData.inclusions);
    const stopsValidation = validateStops(formData.stops);
    const galleryValidation = validateGalleryImages(formData.galleryImages);

    // Combine all validation errors
    const allErrors = {
      ...packageValidation.errors,
      ...pricingValidation.errors,
      ...inclusionsValidation.errors,
      ...stopsValidation.errors,
      ...galleryValidation.errors,
    };

    // Step 6: If validation fails, return 400 with field-specific errors
    if (Object.keys(allErrors).length > 0) {
      return {
        success: false,
        message: "Validation failed. Please check the form for errors.",
        error: "Validation failed",
        errors: allErrors,
      };
    }

    // Step 7: Check concurrency - compare cachedUpdatedAt with database updated_at
    try {
      const { data: concurrencyCheckResult, error: concurrencyError } =
        await sessionClient.rpc("concurrency_check", {
          p_package_id: packageId,
          p_cached_updated_at: cachedUpdatedAt,
        });

      if (concurrencyError) {
        console.error("Concurrency check error:", concurrencyError);
        return {
          success: false,
          message: "Unable to verify package state. Please refresh and try again.",
          error: "Concurrency check failed",
          errors: {},
        };
      }

      // Check if concurrency conflict was detected
      if (concurrencyCheckResult && concurrencyCheckResult.has_conflict) {
        return {
          success: false,
          message: "This package was modified by another session. Please refresh and try again.",
          error: "Concurrency conflict",
          errors: {},
        };
      }
    } catch (error) {
      console.error("Concurrency check exception:", error);
      // Treat concurrency check failure as a retriable error (500)
      return {
        success: false,
        message: "Unable to verify package state. Please try again.",
        error: "Concurrency check failed",
        errors: {},
      };
    }

    // Step 8: Call update_package_and_relations RPC with normalized form data
    // Import the mapper function to normalize form data to RPC payload
    const { toRpcPayload } = await import("./edit-mappers");
    const rpcPayload = toRpcPayload(formData as any);

    const { data: rpcResult, error: rpcError } = await sessionClient.rpc(
      "update_package_and_relations",
      {
        p_package_id: packageId,
        p_package_data: rpcPayload.p_package_data,
        p_price_variants: rpcPayload.p_price_variants,
        p_inclusions: rpcPayload.p_inclusions,
        p_stops: rpcPayload.p_stops,
        p_gallery: rpcPayload.p_gallery,
      }
    );

    // Handle RPC errors
    if (rpcError) {
      console.error("RPC error:", rpcError);
      
      // Check if error message indicates validation failure from RPC
      const errorMessage = rpcError.message || "";
      if (errorMessage.includes("validation") || errorMessage.includes("constraint")) {
        return {
          success: false,
          message: "Package data validation failed on the server.",
          error: "Validation error",
          errors: {},
        };
      }

      return {
        success: false,
        message: "Unable to save package changes. Please try again.",
        error: "Database error",
        errors: {},
      };
    }

    // Step 9: If RPC succeeds, return 200 with success flag and updatedAt
    if (rpcResult && rpcResult.length > 0) {
      const result = rpcResult[0];
      
      if (result.success) {
        return {
          success: true,
          message: "Package updated successfully.",
          updatedAt: result.updated_at,
        };
      } else {
        // RPC returned success=false
        return {
          success: false,
          message: "Unable to save package changes. Please try again.",
          error: "Update failed",
          errors: {},
        };
      }
    }

    // Step 10: If RPC returns unexpected result, return 500
    return {
      success: false,
      message: "Unexpected server response. Please try again.",
      error: "Unexpected response",
      errors: {},
    };
  } catch (error) {
    // Catch unexpected exceptions
    console.error("Unexpected error in updatePackageCore:", error);
    return {
      success: false,
      message: "An unexpected error occurred. Please try again.",
      error: "Unexpected error",
      errors: {},
    };
  }
}

/**
 * Submit package for review.
 * 
 * Purpose:
 * - Call updatePackageCore action first to persist changes
 * - On success, update package status to "pending_review"
 * - Clear rejection_reason field
 * - Return success response with redirect info
 * 
 * Flow:
 * 1. Call updatePackageCore(packageId, formData, cachedUpdatedAt)
 * 2. If updatePackageCore fails, return its error response as-is
 * 3. If updatePackageCore succeeds:
 *    a. Create Supabase server client
 *    b. Update package record: set status="pending_review", rejection_reason=null
 *    c. If update succeeds, return success with redirect info
 *    d. If update fails, return error
 * 4. Error handling: Propagate all errors from updatePackageCore
 * 
 * Validates: Requirements 9.4-9.5, 10.7-10.10
 */
export async function submitPackageForReview(
  packageId: string,
  formData: EditPackageFormInput,
  cachedUpdatedAt: string,
): Promise<UpdatePackageResponse> {
  try {
    // Step 1: Call updatePackageCore action first to persist changes
    const coreUpdateResult = await updatePackageCore(
      packageId,
      formData,
      cachedUpdatedAt
    );

    // Step 2: If updatePackageCore fails, return its error response as-is
    if (!coreUpdateResult.success) {
      return coreUpdateResult;
    }

    // Step 3: If updatePackageCore succeeds, update package status to "pending_review"
    try {
      const sessionClient = await createSupabaseServerClient();

      // Verify authentication again to ensure session is still valid
      const authResult = await requireAuthenticated(sessionClient);
      if ("error" in authResult) {
        return {
          success: false,
          message: authResult.error.message,
          error: authResult.error.message,
          errors: {},
        };
      }

      const { operatorId } = authResult.data;

      // Verify ownership is still valid
      const ownershipResult = await requirePackageOwnership(
        sessionClient,
        packageId,
        operatorId
      );
      if ("error" in ownershipResult) {
        return {
          success: false,
          message: ownershipResult.error.message,
          error: ownershipResult.error.message,
          errors: {},
        };
      }

      // Step 3b: Update package record: set status="pending_review", rejection_reason=null
      const { error: updateError } = await sessionClient
        .from(PACKAGE_TABLE)
        .update({
          status: "pending_review",
          rejection_reason: null,
        })
        .eq("id", packageId)
        .eq("operator_id", operatorId);

      // Step 3d: If update fails, return error
      if (updateError) {
        console.error("Error updating package status:", updateError);
        return {
          success: false,
          message: "Unable to submit package for review. Please try again.",
          error: "Status update failed",
          errors: {},
        };
      }

      // Step 3c: If update succeeds, return success with redirect info
      return {
        success: true,
        message: "Package submitted for review successfully.",
        data: {
          packageId,
          status: "pending_review" as PackageStatus,
        },
      };
    } catch (error) {
      console.error("Error in submitPackageForReview status update:", error);
      return {
        success: false,
        message: "Unable to submit package for review. Please try again.",
        error: "Status update failed",
        errors: {},
      };
    }
  } catch (error) {
    // Catch unexpected exceptions
    console.error("Unexpected error in submitPackageForReview:", error);
    return {
      success: false,
      message: "An unexpected error occurred. Please try again.",
      error: "Unexpected error",
      errors: {},
    };
  }
}

/**
 * Upload package image to Supabase storage.
 * 
 * Purpose:
 * - Verify authentication and operator status
 * - Accept image file from FormData
 * - Validate file format: jpg, jpeg, png, webp only
 * - Validate file size: max 5MB
 * - Upload to Supabase storage bucket with unique path
 * - Generate public URL from storage
 * - Return URL for client to use
 * 
 * Flow:
 * 1. Create Supabase server client
 * 2. Call requireAuthenticated to verify session and operator role
 * 3. Extract file from FormData
 * 4. Validate file MIME type (jpg, jpeg, png, webp only)
 * 5. Validate file size (max 5MB)
 * 6. Generate unique imageId (UUID)
 * 7. Extract file extension from file name
 * 8. Create storage path: tours-package-media/{operatorId}/{packageId}/{imageId}.{ext}
 * 9. Upload file to Supabase storage
 * 10. Get public URL
 * 11. Return success with URL
 * 
 * Error Handling:
 * - 401: Not authenticated -> return 401 error
 * - 403: Not approved operator -> return 403 error
 * - 400: Invalid format or file size -> return 400 error with user-friendly message
 * - 500: Upload failed -> return 500 error
 * 
 * Return type:
 * - { success: boolean; imageUrl?: string; error?: { message: string } }
 * 
 * Validates: Requirements 4.3-4.6, 8.2-8.4
 */
export async function uploadPackageImage(
  packageId: string,
  formData: FormData,
): Promise<{ success: boolean; imageUrl?: string; error?: { message: string } }> {
  try {
    // Step 1: Create Supabase server client
    const sessionClient = await createSupabaseServerClient();

    // Step 2: Verify authentication and operator status
    const authResult = await requireAuthenticated(sessionClient);
    if (authResult.error) {
      return {
        success: false,
        error: {
          message:
            authResult.error.status === 401
              ? "Authentication required. Please log in."
              : "Access denied: operator role required",
        },
      };
    }

    const { operatorId } = authResult.data;

    // Step 3: Validate packageId format
    if (!isUuid(packageId)) {
      return {
        success: false,
        error: { message: "Invalid package ID." },
      };
    }

    // Step 4: Extract file from FormData
    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return {
        success: false,
        error: { message: "No file provided." },
      };
    }

    // Step 5: Validate file MIME type (jpg, jpeg, png, webp only)
    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ];
    if (!allowedMimeTypes.includes(file.type)) {
      return {
        success: false,
        error: {
          message:
            "Invalid file format. Only JPG, PNG, and WebP are allowed.",
        },
      };
    }

    // Step 6: Validate file size (max 5MB = 5242880 bytes)
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: {
          message: "File size too large. Maximum size is 5MB.",
        },
      };
    }

    // Step 7: Generate unique imageId (UUID)
    const imageId = crypto.randomUUID();

    // Step 8: Extract file extension from file name
    const fileName = file.name.toLowerCase();
    const extensionMatch = fileName.match(/\.([a-z0-9]+)$/);
    const extension = extensionMatch ? extensionMatch[1] : "jpg";

    // Step 9: Create storage path: tours-package-media/{operatorId}/{packageId}/{imageId}.{ext}
    const storagePath = `tours-package-media/${operatorId}/${packageId}/${imageId}.${extension}`;

    // Step 10: Upload file to Supabase storage
    const { data, error: uploadError } = await sessionClient.storage
      .from(PACKAGE_STORAGE_BUCKET)
      .upload(storagePath, file, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError || !data) {
      console.error("Storage upload error:", uploadError);
      return {
        success: false,
        error: {
          message: "Failed to upload image. Please try again.",
        },
      };
    }

    // Step 11: Get public URL
    const { data: urlData } = sessionClient.storage
      .from(PACKAGE_STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    // Return success with URL
    return {
      success: true,
      imageUrl: urlData.publicUrl,
    };
  } catch (error) {
    console.error("Error in uploadPackageImage:", error);
    return {
      success: false,
      error: {
        message: "An error occurred while uploading the image.",
      },
    };
  }
}

/**
 * Delete package image from Supabase storage.
 * 
 * Purpose:
 * - Verify authentication and package ownership
 * - Verify package status is "draft" (only draft packages allow deletion)
 * - Extract storage path from public URL
 * - Delete file from Supabase storage
 * - Return success confirmation
 * 
 * Flow:
 * 1. Create Supabase server client
 * 2. Call requireAuthenticated to verify session and operator role
 * 3. Call requirePackageOwnership to verify operator owns the package
 * 4. Load package status from database
 * 5. Check status is "draft" (return 403 if not)
 * 6. Extract storage path from imageUrl
 * 7. Delete file from Supabase storage
 * 8. Return success confirmation
 * 
 * Error Handling:
 * - 401: Not authenticated -> return 401 error
 * - 403: Not approved operator, not owner, or package not in draft status -> return 403 error
 * - 404: Package not found -> return 404 error
 * - 500: Delete failed -> return 500 error
 * 
 * Return type:
 * - { success: boolean; message?: string; error?: { message: string } }
 * 
 * Validates: Requirements 8.7
 */
export async function deletePackageImage(
  packageId: string,
  imageUrl: string,
): Promise<{ success: boolean; message?: string; error?: { message: string } }> {
  try {
    // Step 1: Create Supabase server client
    const sessionClient = await createSupabaseServerClient();

    // Step 2: Verify authentication and operator status
    const authResult = await requireAuthenticated(sessionClient);
    if (authResult.error) {
      return {
        success: false,
        error: {
          message:
            authResult.error.status === 401
              ? "Authentication required. Please log in."
              : "Access denied: operator role required",
        },
      };
    }

    const { operatorId } = authResult.data;

    // Step 3: Validate packageId format
    if (!isUuid(packageId)) {
      return {
        success: false,
        error: { message: "Invalid package ID." },
      };
    }

    // Step 4: Verify operator ownership
    const ownershipResult = await requirePackageOwnership(
      sessionClient,
      packageId,
      operatorId
    );
    if (ownershipResult.error) {
      return {
        success: false,
        error: {
          message:
            ownershipResult.error.status === 404
              ? "Package not found."
              : "Access denied: you do not own this package",
        },
      };
    }

    const { status } = ownershipResult.data;

    // Step 5: Check package status is "draft" (only draft packages allow deletion)
    if (status !== "draft") {
      return {
        success: false,
        error: {
          message:
            "Images can only be deleted from draft packages. Published or pending review packages are locked.",
        },
      };
    }

    // Step 6: Extract storage path from imageUrl
    // The public URL format from Supabase is:
    // https://<project-id>.supabase.co/storage/v1/object/public/<bucket>/<path>
    // We need to extract: <path> which includes: tours-package-media/{operatorId}/{packageId}/{imageId}.{ext}
    let storagePath: string | null = null;
    try {
      const url = new URL(imageUrl);
      // Match the path after /public/
      const match = url.pathname.match(
        /\/public\/([a-z0-9-]+)\/(.+)$/i
      );
      if (match) {
        // match[2] contains the full path: tours-package-media/{operatorId}/{packageId}/{imageId}.{ext}
        storagePath = match[2];
      }
    } catch {
      // URL parsing failed, try direct string parsing
      const publicMatch = imageUrl.split("/public/")[1];
      if (publicMatch) {
        // Remove bucket name to get just the path
        const pathParts = publicMatch.split("/");
        if (pathParts.length > 1) {
          storagePath = pathParts.slice(1).join("/");
        }
      }
    }

    if (!storagePath) {
      return {
        success: false,
        error: {
          message: "Invalid image URL format.",
        },
      };
    }

    // Step 7: Delete file from Supabase storage
    const { error: deleteError } = await sessionClient.storage
      .from(PACKAGE_STORAGE_BUCKET)
      .remove([storagePath]);

    if (deleteError) {
      console.error("Storage delete error:", deleteError);
      return {
        success: false,
        error: {
          message: "Failed to delete image. Please try again.",
        },
      };
    }

    // Step 8: Return success confirmation
    return {
      success: true,
      message: "Image deleted successfully.",
    };
  } catch (error) {
    console.error("Error in deletePackageImage:", error);
    return {
      success: false,
      error: {
        message: "An error occurred while deleting the image.",
      },
    };
  }
}
