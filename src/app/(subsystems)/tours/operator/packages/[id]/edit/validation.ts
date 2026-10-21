import { ALLOWED_IMAGE_EXTENSIONS, ALLOWED_IMAGE_TYPES, EDIT_LIMITS } from "./edit-constants";
import type {
  BasicDetailsData,
  EditGalleryImage,
  EditInclusion,
  EditPackageFormData,
  EditPriceVariant,
  EditStop,
  ValidationErrors,
  ValidationResult,
} from "./edit-types";

/* ------------------------------------------------------------------ helpers */

function result(errors: ValidationErrors): ValidationResult {
  return { valid: Object.keys(errors).length === 0, errors };
}

function textLength(value: unknown): number {
  return typeof value === "string" ? value.trim().length : 0;
}

function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isIntInRange(value: unknown, min: number, max: number): value is number {
  return isNumberInRange(value, min, max) && Number.isInteger(value);
}

/** True when the values are unique and form 1..n once sorted. */
export function isSequentialOrder(values: number[]): boolean {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.every((value, index) => value === index + 1);
}

/** Returns a copy whose order field is rewritten to 1..n based on array position. */
export function resequence<T>(items: T[], key: keyof T): T[] {
  return items.map((item, index) => ({ ...item, [key]: index + 1 }));
}

/* -------------------------------------------------------------- basic info */

export function validateBasicInfo(data: Partial<BasicDetailsData>): ValidationResult {
  const errors: ValidationErrors = {};
  const { title, locationName, description, durationValue, durationType } = data ?? {};

  const titleLength = textLength(title);
  if (titleLength === 0) errors.title = "Title is required.";
  else if (titleLength < EDIT_LIMITS.title.min || titleLength > EDIT_LIMITS.title.max) {
    errors.title = `Title must be ${EDIT_LIMITS.title.min}-${EDIT_LIMITS.title.max} characters.`;
  }

  const locationLength = textLength(locationName);
  if (locationLength === 0) errors.locationName = "Location is required.";
  else if (
    locationLength < EDIT_LIMITS.locationName.min ||
    locationLength > EDIT_LIMITS.locationName.max
  ) {
    errors.locationName = `Location must be ${EDIT_LIMITS.locationName.min}-${EDIT_LIMITS.locationName.max} characters.`;
  }

  if (description !== null && description !== undefined) {
    if (typeof description !== "string") errors.description = "Description must be text.";
    else {
      const length = description.trim().length;
      if (
        length > 0 &&
        (length < EDIT_LIMITS.description.min || length > EDIT_LIMITS.description.max)
      ) {
        errors.description = `Description must be ${EDIT_LIMITS.description.min}-${EDIT_LIMITS.description.max} characters.`;
      }
    }
  }

  if (!isNumberInRange(durationValue, EDIT_LIMITS.duration.min, EDIT_LIMITS.duration.max)) {
    errors.durationValue = `Duration must be between ${EDIT_LIMITS.duration.min} and ${EDIT_LIMITS.duration.max}.`;
  }

  if (durationType !== "hours" && durationType !== "days") {
    errors.durationType = "Choose hours or days.";
  }

  return result(errors);
}

/* ----------------------------------------------------------------- pricing */

export function validateVariant(variant: EditPriceVariant, prefix = ""): ValidationErrors {
  const errors: ValidationErrors = {};
  const key = (field: string) => `${prefix}${field}`;

  const nameLength = textLength(variant.variantName);
  if (nameLength < EDIT_LIMITS.variantName.min || nameLength > EDIT_LIMITS.variantName.max) {
    errors[key("variantName")] = `Name must be ${EDIT_LIMITS.variantName.min}-${EDIT_LIMITS.variantName.max} characters.`;
  }

  if (!isIntInRange(variant.minPax, EDIT_LIMITS.pax.min, EDIT_LIMITS.pax.max)) {
    errors[key("minPax")] = "Min pax must be a whole number from 1 to 10,000.";
  }

  if (variant.maxPax !== null) {
    if (!isIntInRange(variant.maxPax, EDIT_LIMITS.pax.min, EDIT_LIMITS.pax.max)) {
      errors[key("maxPax")] = "Max pax must be a whole number from 1 to 10,000.";
    } else if (Number.isFinite(variant.minPax) && variant.maxPax < variant.minPax) {
      errors[key("maxPax")] = "Max pax cannot be less than min pax.";
    }
  }

  if (variant.pricePerPax === null && variant.flatPrice === null) {
    errors[key("price")] = "Set a price per pax or a flat price.";
  }
  const priceRangeMessage = "Price must be between ₱0.01 and ₱999,999.99.";
  if (
    variant.pricePerPax !== null &&
    !isNumberInRange(variant.pricePerPax, EDIT_LIMITS.price.min, EDIT_LIMITS.price.max)
  ) {
    errors[key("pricePerPax")] = priceRangeMessage;
  }
  if (
    variant.flatPrice !== null &&
    !isNumberInRange(variant.flatPrice, EDIT_LIMITS.price.min, EDIT_LIMITS.price.max)
  ) {
    errors[key("flatPrice")] = priceRangeMessage;
  }

  return errors;
}

export function validatePricing(variants: EditPriceVariant[]): ValidationResult {
  const errors: ValidationErrors = {};
  if (!Array.isArray(variants) || variants.length === 0) {
    errors.priceVariants = "Add at least one price variant.";
    return result(errors);
  }

  variants.forEach((variant, index) => {
    Object.assign(errors, validateVariant(variant, `priceVariants.${index}.`));
  });

  const defaults = variants.filter((variant) => variant.isDefault).length;
  if (defaults !== 1) errors.priceVariants = "Mark exactly one price variant as the default.";

  return result(errors);
}

/* -------------------------------------------------------------- inclusions */

export function validateInclusionText(text: string): string | null {
  const length = textLength(text);
  if (length < EDIT_LIMITS.inclusionText.min || length > EDIT_LIMITS.inclusionText.max) {
    return `Item must be ${EDIT_LIMITS.inclusionText.min}-${EDIT_LIMITS.inclusionText.max} characters.`;
  }
  return null;
}

export function validateInclusions(items: EditInclusion[]): ValidationResult {
  const errors: ValidationErrors = {};
  if (!Array.isArray(items)) {
    errors.inclusions = "Inclusions are invalid.";
    return result(errors);
  }

  if (!items.some((item) => item.isIncluded)) {
    errors.inclusions = "Add at least one included item.";
  } else if (items.length > EDIT_LIMITS.maxInclusions) {
    errors.inclusions = `You can list up to ${EDIT_LIMITS.maxInclusions} items.`;
  } else if (!isSequentialOrder(items.map((item) => item.displayOrder))) {
    errors.inclusions = "Item order is invalid. Reorder the list and try again.";
  }

  items.forEach((item, index) => {
    const message = validateInclusionText(item.text);
    if (message) errors[`inclusions.${index}.text`] = message;
  });

  return result(errors);
}

/* ------------------------------------------------------------------- stops */

export function validateStop(stop: EditStop, prefix = ""): ValidationErrors {
  const errors: ValidationErrors = {};
  const key = (field: string) => `${prefix}${field}`;

  const nameLength = textLength(stop.locationName);
  if (nameLength < EDIT_LIMITS.stopLocation.min || nameLength > EDIT_LIMITS.stopLocation.max) {
    errors[key("locationName")] = `Stop name must be ${EDIT_LIMITS.stopLocation.min}-${EDIT_LIMITS.stopLocation.max} characters.`;
  }

  if (stop.description !== null && stop.description !== undefined) {
    const length = textLength(stop.description);
    if (
      length > 0 &&
      (length < EDIT_LIMITS.stopDescription.min || length > EDIT_LIMITS.stopDescription.max)
    ) {
      errors[key("description")] = `Description must be ${EDIT_LIMITS.stopDescription.min}-${EDIT_LIMITS.stopDescription.max} characters.`;
    }
  }

  if (!isNumberInRange(stop.latitude, -90, 90)) {
    errors[key("latitude")] = "Latitude must be between -90 and 90.";
  }
  if (!isNumberInRange(stop.longitude, -180, 180)) {
    errors[key("longitude")] = "Longitude must be between -180 and 180.";
  }

  return errors;
}

export function validateStops(stops: EditStop[]): ValidationResult {
  const errors: ValidationErrors = {};
  if (!Array.isArray(stops) || stops.length === 0) {
    errors.stops = "Add at least one itinerary stop.";
    return result(errors);
  }
  if (stops.length > EDIT_LIMITS.maxStops) {
    errors.stops = `You can add up to ${EDIT_LIMITS.maxStops} stops.`;
  } else if (!isSequentialOrder(stops.map((stop) => stop.stopOrder))) {
    errors.stops = "Stop order is invalid. Reorder the stops and try again.";
  }

  stops.forEach((stop, index) => {
    Object.assign(errors, validateStop(stop, `stops.${index}.`));
  });

  return result(errors);
}

/* ----------------------------------------------------------------- gallery */

export function validateCaption(caption: string | null): string | null {
  if (caption && caption.length > EDIT_LIMITS.caption.max) {
    return `Caption must be ${EDIT_LIMITS.caption.max} characters or fewer.`;
  }
  return null;
}

export function validateGallery(images: EditGalleryImage[]): ValidationResult {
  const errors: ValidationErrors = {};
  if (!Array.isArray(images)) {
    errors.galleryImages = "Gallery is invalid.";
    return result(errors);
  }
  if (images.length > EDIT_LIMITS.maxGalleryImages) {
    errors.galleryImages = `You can add up to ${EDIT_LIMITS.maxGalleryImages} images.`;
  } else if (!isSequentialOrder(images.map((image) => image.displayOrder))) {
    errors.galleryImages = "Image order is invalid. Reorder the gallery and try again.";
  }

  images.forEach((image, index) => {
    if (!image.imageUrl || !image.imageUrl.trim()) {
      errors[`galleryImages.${index}.imageUrl`] = "Image is missing.";
    }
    const message = validateCaption(image.caption);
    if (message) errors[`galleryImages.${index}.caption`] = message;
  });

  return result(errors);
}

/* ------------------------------------------------------------------ images */

/** Client + server pre-check for an uploaded image's declared type, name and size. */
export function validateImageFile(file: { name: string; type: string; size: number }): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const typeAllowed = (ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type.toLowerCase());
  const extensionAllowed = (ALLOWED_IMAGE_EXTENSIONS as readonly string[]).includes(extension);
  if (!typeAllowed || !extensionAllowed) {
    return "Use a JPG, PNG, or WebP image.";
  }
  if (file.size <= 0) return "The selected file is empty.";
  if (file.size > EDIT_LIMITS.imageBytes) return "Images must be 5 MB or smaller.";
  return null;
}

/* -------------------------------------------------------------- full form */

export function validateEditForm(data: EditPackageFormData): ValidationResult {
  const errors: ValidationErrors = {
    ...validateBasicInfo(data).errors,
    ...validatePricing(data.priceVariants).errors,
    ...validateInclusions(data.inclusions).errors,
    ...validateStops(data.stops).errors,
    ...validateGallery(data.galleryImages).errors,
  };
  if (data.coverImageUrl !== null && typeof data.coverImageUrl !== "string") {
    errors.coverImageUrl = "Cover image is invalid.";
  }
  return result(errors);
}

/* Spec-named aliases (server-side task names) */
export const validatePackageFormData = validateBasicInfo;
export const validatePricingVariants = validatePricing;
export const validateGalleryImages = validateGallery;

/* ---------------------------------------------------------- error parsing */

export type ErrorSection = "basic" | "cover" | "pricing" | "inclusions" | "stops" | "gallery" | "general";

export interface SectionErrors {
  /** Section-level messages (e.g. "Add at least one stop"). */
  messages: string[];
  /** Field-level messages keyed by field name (basic) or `${index}.${field}` (lists). */
  fields: Record<string, string>;
}

export type ParsedValidationErrors = Record<ErrorSection, SectionErrors>;

const SECTION_BY_ROOT: Record<string, ErrorSection> = {
  title: "basic",
  locationName: "basic",
  description: "basic",
  durationValue: "basic",
  durationType: "basic",
  coverImageUrl: "cover",
  priceVariants: "pricing",
  inclusions: "inclusions",
  stops: "stops",
  galleryImages: "gallery",
};

/** Groups a flat error map into per-section field/section messages for display. */
export function parseValidationErrors(errors: ValidationErrors | undefined | null): ParsedValidationErrors {
  const parsed = Object.fromEntries(
    (["basic", "cover", "pricing", "inclusions", "stops", "gallery", "general"] as ErrorSection[]).map(
      (section) => [section, { messages: [], fields: {} } satisfies SectionErrors],
    ),
  ) as ParsedValidationErrors;

  for (const [key, message] of Object.entries(errors ?? {})) {
    const [root, ...rest] = key.split(".");
    const section = SECTION_BY_ROOT[root] ?? "general";
    if (section === "basic" || section === "cover") {
      parsed[section].fields[root] = message;
    } else if (rest.length === 0) {
      parsed[section].messages.push(message);
    } else {
      parsed[section].fields[rest.join(".")] = message;
    }
  }
  return parsed;
}

/** Number of distinct problems in an error map. */
export function countErrors(errors: ValidationErrors): number {
  return Object.keys(errors).length;
}
