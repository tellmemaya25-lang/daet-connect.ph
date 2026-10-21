// Client-side and shared validation utilities (NOT a server action file)
// This file contains pure validation functions that can be used by both
// client components and server actions

import type { EditPackageFormInput, PriceVariantInput, PackageStopInput } from "@/lib/tours/package-contract";

/**
 * Validate package form data (basic info).
 * 
 * Purpose:
 * - Validate title: 3-150 chars, required
 * - Validate location_name: 2-100 chars, required
 * - Validate description: 10-3000 chars if provided
 * - Validate duration_value: 0.5-365, required
 * - Validate duration_type: "hours" or "days", required
 * 
 * Parameters:
 * - data: Partial object containing title, locationName, description, durationValue, durationType
 * 
 * Returns:
 * - { valid: true, errors: {} } if all validations pass
 * - { valid: false, errors: { fieldName: "error message", ... } } if any validation fails
 * 
 * Validates: Requirements 3.1-3.8, 12.1-12.7
 */
export function validatePackageFormData(data: unknown): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  if (!data || typeof data !== "object") {
    return { valid: false, errors: { _error: "Form data is invalid" } };
  }

  const formData = data as Partial<{
    title: unknown;
    locationName: unknown;
    description: unknown;
    durationValue: unknown;
    durationType: unknown;
  }>;

  // Validate title: 3-150 chars, required
  const title = typeof formData.title === "string" ? formData.title.trim() : "";
  if (title.length === 0) {
    errors.title = "Title is required.";
  } else if (title.length < 3 || title.length > 150) {
    errors.title = "Title must be 3-150 characters.";
  }

  // Validate location: 2-100 chars, required
  const locationName =
    typeof formData.locationName === "string"
      ? formData.locationName.trim()
      : "";
  if (locationName.length === 0) {
    errors.locationName = "Location is required.";
  } else if (locationName.length < 2 || locationName.length > 100) {
    errors.locationName = "Location must be 2-100 characters.";
  }

  // Validate description: 10-3000 chars if provided
  if (formData.description !== null && formData.description !== undefined) {
    const description =
      typeof formData.description === "string"
        ? formData.description.trim()
        : "";
    if (description.length > 0) {
      if (description.length < 10 || description.length > 3000) {
        errors.description = "Description must be 10-3000 characters.";
      }
    }
  }

  // Validate duration value: 0.5-365, required
  const durationValue = formData.durationValue;
  if (
    typeof durationValue !== "number" ||
    !Number.isFinite(durationValue) ||
    durationValue < 0.5 ||
    durationValue > 365
  ) {
    errors.durationValue =
      "Duration must be between 0.5 and 365.";
  }

  // Validate duration type: "hours" or "days", required
  if (
    formData.durationType !== "hours" &&
    formData.durationType !== "days"
  ) {
    errors.durationType = "Duration type must be 'hours' or 'days'.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate pricing variants array.
 */
export function validatePricingVariants(variants: unknown[]): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  if (!Array.isArray(variants)) {
    return {
      valid: false,
      errors: {
        priceVariants: "Price variants must be an array.",
      },
    };
  }

  if (variants.length === 0) {
    return {
      valid: false,
      errors: {
        priceVariants: "Add at least one price variant.",
      },
    };
  }

  let defaultCount = 0;

  variants.forEach((variant, index) => {
    if (!variant || typeof variant !== "object") {
      errors[`priceVariants.${index}`] = "Variant is invalid.";
      return;
    }

    const v = variant as Partial<{
      variantName: unknown;
      minPax: unknown;
      maxPax: unknown;
      pricePerPax: unknown;
      flatPrice: unknown;
      isDefault: unknown;
    }>;

    const variantName =
      typeof v.variantName === "string"
        ? v.variantName.trim()
        : "";
    if (variantName.length === 0 || variantName.length > 100) {
      errors[`priceVariants.${index}.variantName`] =
        "Variant name must be 1-100 characters.";
    }

    const minPax = v.minPax;
    if (
      typeof minPax !== "number" ||
      !Number.isInteger(minPax) ||
      minPax < 1 ||
      minPax > 10000
    ) {
      errors[`priceVariants.${index}.minPax`] =
        "Min pax must be a whole number from 1 to 10,000.";
    }

    const maxPax = v.maxPax;
    if (maxPax !== null && maxPax !== undefined) {
      if (
        typeof maxPax !== "number" ||
        !Number.isInteger(maxPax) ||
        maxPax < 1 ||
        maxPax > 10000
      ) {
        errors[`priceVariants.${index}.maxPax`] =
          "Max pax must be a whole number from 1 to 10,000.";
      } else if (
        typeof minPax === "number" &&
        Number.isInteger(minPax) &&
        maxPax < minPax
      ) {
        errors[`priceVariants.${index}.maxPax`] =
          "Max pax cannot be less than min pax.";
      }
    }

    const pricePerPax = v.pricePerPax;
    const flatPrice = v.flatPrice;

    if (pricePerPax === null && flatPrice === null) {
      errors[`priceVariants.${index}.price`] =
        "Set a price per pax or a flat price.";
    } else {
      if (pricePerPax !== null && pricePerPax !== undefined) {
        if (
          typeof pricePerPax !== "number" ||
          !Number.isFinite(pricePerPax) ||
          pricePerPax < 0.01 ||
          pricePerPax > 999999.99
        ) {
          errors[`priceVariants.${index}.pricePerPax`] =
            "Price per pax must be between ₱0.01 and ₱999,999.99.";
        }
      }

      if (flatPrice !== null && flatPrice !== undefined) {
        if (
          typeof flatPrice !== "number" ||
          !Number.isFinite(flatPrice) ||
          flatPrice < 0.01 ||
          flatPrice > 999999.99
        ) {
          errors[`priceVariants.${index}.flatPrice`] =
            "Flat price must be between ₱0.01 and ₱999,999.99.";
        }
      }
    }

    if (v.isDefault === true) {
      defaultCount++;
    }
  });

  if (defaultCount !== 1) {
    errors.priceVariants =
      "Mark exactly one price variant as the default.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate inclusions/exclusions array.
 */
export function validateInclusions(inclusions: unknown[]): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  if (!Array.isArray(inclusions)) {
    return {
      valid: false,
      errors: {
        inclusions: "Inclusions must be an array.",
      },
    };
  }

  const hasInclusion = inclusions.some(
    (item) =>
      item && typeof item === "object" && "isIncluded" in item && item.isIncluded === true
  );

  if (!hasInclusion) {
    return {
      valid: false,
      errors: {
        inclusions: "Add at least one included item.",
      },
    };
  }

  if (inclusions.length > 50) {
    return {
      valid: false,
      errors: {
        inclusions: "You can list up to 50 items.",
      },
    };
  }

  const displayOrders: number[] = [];

  inclusions.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      errors[`inclusions.${index}`] = "Item is invalid.";
      return;
    }

    const i = item as Partial<{
      text: unknown;
      isIncluded: unknown;
      displayOrder: unknown;
    }>;

    const text = typeof i.text === "string" ? i.text.trim() : "";
    if (text.length < 1 || text.length > 500) {
      errors[`inclusions.${index}.text`] =
        "Item text must be 1-500 characters.";
    }

    if (
      typeof i.displayOrder === "number" &&
      Number.isInteger(i.displayOrder)
    ) {
      displayOrders.push(i.displayOrder);
    }
  });

  // Verify display_order unique and sequential (only if all items have valid displayOrder)
  if (displayOrders.length === inclusions.length && inclusions.length > 0) {
    const sortedOrders = [...displayOrders].sort((a, b) => a - b);
    const isSequential = sortedOrders.every(
      (order, idx) => order === idx + 1
    );
    const isUnique = new Set(displayOrders).size === displayOrders.length;

    if (!isUnique) {
      errors.inclusions = "Item order must be unique.";
    } else if (!isSequential) {
      errors.inclusions =
        "Item order must be sequential (1, 2, 3...).";
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate stops array.
 */
export function validateStops(stops: unknown[]): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  if (!Array.isArray(stops)) {
    return {
      valid: false,
      errors: {
        stops: "Stops must be an array.",
      },
    };
  }

  if (stops.length === 0) {
    return {
      valid: false,
      errors: {
        stops: "Add at least one itinerary stop.",
      },
    };
  }

  if (stops.length > 50) {
    return {
      valid: false,
      errors: {
        stops: "You can add up to 50 stops.",
      },
    };
  }

  const stopOrders: number[] = [];

  stops.forEach((stop, index) => {
    if (!stop || typeof stop !== "object") {
      errors[`stops.${index}`] = "Stop is invalid.";
      return;
    }

    const s = stop as Partial<{
      locationName: unknown;
      description: unknown;
      latitude: unknown;
      longitude: unknown;
      stopOrder: unknown;
    }>;

    const locationName =
      typeof s.locationName === "string"
        ? s.locationName.trim()
        : "";
    if (locationName.length < 2 || locationName.length > 100) {
      errors[`stops.${index}.locationName`] =
        "Location name must be 2-100 characters.";
    }

    if (s.description !== null && s.description !== undefined) {
      const description =
        typeof s.description === "string"
          ? s.description.trim()
          : "";
      if (description.length > 0) {
        if (description.length < 10 || description.length > 1000) {
          errors[`stops.${index}.description`] =
            "Description must be 10-1000 characters.";
        }
      }
    }

    const latitude = s.latitude;
    if (
      typeof latitude !== "number" ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90
    ) {
      errors[`stops.${index}.latitude`] =
        "Latitude must be between -90 and 90.";
    }

    const longitude = s.longitude;
    if (
      typeof longitude !== "number" ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      errors[`stops.${index}.longitude`] =
        "Longitude must be between -180 and 180.";
    }

    if (
      typeof s.stopOrder === "number" &&
      Number.isInteger(s.stopOrder)
    ) {
      stopOrders.push(s.stopOrder);
    }
  });

  // Verify stop_order unique and sequential (only if all stops have valid stop_order)
  if (stopOrders.length === stops.length) {
    const sortedOrders = [...stopOrders].sort((a, b) => a - b);
    const isSequential = sortedOrders.every(
      (order, idx) => order === idx + 1
    );
    const isUnique = new Set(stopOrders).size === stopOrders.length;

    if (!isUnique) {
      errors.stops = "Stop order must be unique.";
    } else if (!isSequential) {
      errors.stops = "Stop order must be sequential (1, 2, 3...).";
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate gallery images array.
 */
export function validateGalleryImages(images: unknown[]): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  if (!Array.isArray(images)) {
    return {
      valid: false,
      errors: {
        galleryImages: "Gallery images must be an array.",
      },
    };
  }

  if (images.length > 20) {
    return {
      valid: false,
      errors: {
        galleryImages: "You can add up to 20 images.",
      },
    };
  }

  const displayOrders: number[] = [];

  images.forEach((image, index) => {
    if (!image || typeof image !== "object") {
      errors[`galleryImages.${index}`] = "Image is invalid.";
      return;
    }

    const img = image as Partial<{
      caption: unknown;
      displayOrder: unknown;
    }>;

    if (img.caption !== null && img.caption !== undefined) {
      const caption =
        typeof img.caption === "string"
          ? img.caption.trim()
          : "";
      if (caption.length > 500) {
        errors[`galleryImages.${index}.caption`] =
          "Caption must be 500 characters or fewer.";
      }
    }

    if (
      typeof img.displayOrder === "number" &&
      Number.isInteger(img.displayOrder)
    ) {
      displayOrders.push(img.displayOrder);
    }
  });

  // Verify display_order unique and sequential (only if all images have valid displayOrder)
  if (images.length > 0 && displayOrders.length === images.length) {
    const sortedOrders = [...displayOrders].sort((a, b) => a - b);
    const isSequential = sortedOrders.every(
      (order, idx) => order === idx + 1
    );
    const isUnique = new Set(displayOrders).size === displayOrders.length;

    if (!isUnique) {
      errors.galleryImages = "Image order must be unique.";
    } else if (!isSequential) {
      errors.galleryImages =
        "Image order must be sequential (1, 2, 3...).";
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
