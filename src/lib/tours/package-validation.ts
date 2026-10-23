export interface PriceVariantInput {
  id?: string;
  variantName: string;
  minPax: number;
  maxPax: number | null;
  pricePerPax: number | null;
  flatPrice: number | null;
  isDefault: boolean;
}

export interface PackageStopInput {
  id?: string;
  locationName: string;
  latitude: number;
  longitude: number;
  description: string | null;
  estimatedDurationMinutes: number | null;
}

/**
 * Validation result type for form data validation functions.
 * 
 * Provides a structured way to report validation success/failure
 * with field-specific error messages for form-level error display.
 */
export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string[]>;
}

/**
 * Represents the basic package form data fields for validation.
 * This is a partial type that can accept an EditPackageFormInput
 * or a subset of basic info fields.
 */
export interface BasicPackageInfo {
  title?: string | null;
  description?: string | null;
  locationName?: string | null;
  durationValue?: number | null;
  durationType?: string | null;
}

/**
 * Validates basic package information fields according to requirements.
 * 
 * Validation Rules:
 * - title: required, 3-150 characters, trimmed
 * - locationName: required, 2-100 characters, trimmed
 * - description: optional, but if provided must be 10-3000 characters, trimmed
 * - durationValue: required, must be between 0.5 and 365
 * - durationType: required, must be exactly "hours" or "days"
 * 
 * Purpose:
 * - Validates all basic information fields for package edit/create forms
 * - Collects field-level error messages for each validation failure
 * - Returns structured result for form-level error display
 * 
 * Parameters:
 * - data: BasicPackageInfo object with fields to validate (can be partial)
 * 
 * Returns:
 * - { valid: true, errors: {} } if all validations pass
 * - { valid: false, errors: { fieldName: [errorMessage] } } if validations fail
 * 
 * Examples:
 * - Valid data: { title: "Tour Title", description: "Tour description", locationName: "Location", durationValue: 1.5, durationType: "hours" }
 * - Invalid title: { title: "AB" } → { valid: false, errors: { title: ["Title must be between 3 and 150 characters"] } }
 * - Multiple errors: { title: "", locationName: "", durationValue: 0.2 } → { valid: false, errors: { title: [...], locationName: [...], durationValue: [...] } }
 * 
 * Validates: Requirements 3.1-3.8, 12.1-12.7
 * Property: Property 7 - Field Validation Framework
 */
export function validatePackageFormData(
  data: BasicPackageInfo,
): ValidationResult {
  const errors: Record<string, string[]> = {};

  // Validate title
  const title = typeof data.title === "string" ? data.title.trim() : "";
  if (!title) {
    errors.title = ["Title is required"];
  } else if (title.length < 3) {
    errors.title = ["Title must be at least 3 characters"];
  } else if (title.length > 150) {
    errors.title = ["Title must be at most 150 characters"];
  }

  // Validate locationName
  const locationName = typeof data.locationName === "string" ? data.locationName.trim() : "";
  if (!locationName) {
    errors.locationName = ["Location name is required"];
  } else if (locationName.length < 2) {
    errors.locationName = ["Location name must be at least 2 characters"];
  } else if (locationName.length > 100) {
    errors.locationName = ["Location name must be at most 100 characters"];
  }

  // Validate description (optional if null, but required if provided)
  if (data.description !== null && data.description !== undefined) {
    const description = typeof data.description === "string" ? data.description.trim() : "";
    if (description.length > 0 && description.length < 10) {
      errors.description = ["Description must be at least 10 characters"];
    } else if (description.length > 3000) {
      errors.description = ["Description must be at most 3000 characters"];
    }
  }

  // Validate durationValue
  if (typeof data.durationValue !== "number" || !Number.isFinite(data.durationValue)) {
    errors.durationValue = ["Duration is required"];
  } else if (data.durationValue < 0.5) {
    errors.durationValue = ["Duration must be at least 0.5"];
  } else if (data.durationValue > 365) {
    errors.durationValue = ["Duration must be at most 365"];
  }

  // Validate durationType
  if (!data.durationType) {
    errors.durationType = ["Duration type is required"];
  } else if (data.durationType !== "hours" && data.durationType !== "days") {
    errors.durationType = ["Duration type must be either 'hours' or 'days'"];
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/** Mirrors price_variant_check exactly for the price fields: OR, not XOR. */
export function validatePriceVariant(variant: PriceVariantInput): string | null {
  if (!variant || typeof variant.variantName !== "string" || !variant.variantName.trim()) {
    return "Variant name is required.";
  }
  if (!Number.isFinite(variant.minPax) || !Number.isInteger(variant.minPax) || variant.minPax < 1) {
    return "Minimum pax must be at least 1.";
  }
  if (variant.maxPax !== null) {
    if (!Number.isFinite(variant.maxPax) || !Number.isInteger(variant.maxPax)) {
      return "Maximum pax must be a whole number.";
    }
    if (variant.maxPax < variant.minPax) {
      return "Maximum pax cannot be less than minimum pax.";
    }
  }
  if (
    (variant.pricePerPax !== null && !Number.isFinite(variant.pricePerPax)) ||
    (variant.flatPrice !== null && !Number.isFinite(variant.flatPrice))
  ) {
    return "Prices must be finite numbers.";
  }
  if (variant.pricePerPax === null && variant.flatPrice === null) {
    return "Either price per pax or flat price must be set.";
  }
  return null;
}

export function validatePackageStop(stop: PackageStopInput): string | null {
  if (!stop || typeof stop.locationName !== "string" || !stop.locationName.trim()) {
    return "Stop location name is required.";
  }
  if (!Number.isFinite(stop.latitude) || stop.latitude < -90 || stop.latitude > 90) {
    return "Latitude must be between -90 and 90.";
  }
  if (!Number.isFinite(stop.longitude) || stop.longitude < -180 || stop.longitude > 180) {
    return "Longitude must be between -180 and 180.";
  }
  if (stop.description !== null && typeof stop.description !== "string") {
    return "Stop description must be text.";
  }
  if (
    stop.estimatedDurationMinutes !== null &&
    (!Number.isFinite(stop.estimatedDurationMinutes) || stop.estimatedDurationMinutes < 0)
  ) {
    return "Estimated duration must be a non-negative number of minutes.";
  }
  return null;
}
