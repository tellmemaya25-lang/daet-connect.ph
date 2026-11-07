/**
 * Turns whatever the browser posted into the draft shape the rest of the app
 * expects — or rejects it.
 *
 * Server actions receive untrusted input: the wizard's payload is a plain JSON
 * object, so every field is checked for type and size here and rebuilt field by
 * field. Nothing is spread straight into a database write.
 */

import { EDIT_LIMITS } from "../[id]/edit/edit-constants";
import type {
  EditGalleryImage,
  EditInclusion,
  EditPackageFormData,
  EditPriceVariant,
  EditStop,
} from "../[id]/edit/edit-types";

const MAX_TEXT = 5000;
const MAX_ITEMS = { priceVariants: 20, inclusions: EDIT_LIMITS.maxInclusions, stops: EDIT_LIMITS.maxStops, gallery: EDIT_LIMITS.maxGalleryImages } as const;

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A string, trimmed, capped so an oversized payload cannot reach Postgres. */
function text(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function optionalText(value: unknown, max = MAX_TEXT): string | null {
  const trimmed = text(value, max);
  return trimmed === null || trimmed === "" ? null : trimmed;
}

function number(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Coordinates must arrive as numbers. A string is not coerced: the stop is
 * handed to validation as NaN so the operator sees a plain error instead of a
 * silently invented location.
 */
function coordinate(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  return number(value);
}

function id(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= 64 ? value : undefined;
}

function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, max);
}

function parseVariant(value: unknown): EditPriceVariant | null {
  if (!isRecord(value)) return null;
  return {
    id: id(value.id),
    variantName: text(value.variantName, EDIT_LIMITS.variantName.max) ?? "",
    minPax: number(value.minPax) ?? 0,
    maxPax: optionalNumber(value.maxPax),
    pricePerPax: optionalNumber(value.pricePerPax),
    flatPrice: optionalNumber(value.flatPrice),
    isDefault: value.isDefault === true,
  };
}

function parseInclusion(value: unknown, index: number): EditInclusion | null {
  if (!isRecord(value)) return null;
  return {
    id: id(value.id),
    text: text(value.text, EDIT_LIMITS.inclusionText.max) ?? "",
    isIncluded: value.isIncluded !== false,
    displayOrder: number(value.displayOrder) ?? index + 1,
  };
}

function parseStop(value: unknown, index: number): EditStop | null {
  if (!isRecord(value)) return null;
  return {
    id: id(value.id),
    locationName: text(value.locationName, EDIT_LIMITS.stopLocation.max) ?? "",
    description: optionalText(value.description, EDIT_LIMITS.stopDescription.max),
    latitude: coordinate(value.latitude),
    longitude: coordinate(value.longitude),
    estimatedDurationMinutes: optionalNumber(value.estimatedDurationMinutes),
    stopOrder: number(value.stopOrder) ?? index + 1,
  };
}

function parseGalleryImage(value: unknown, index: number): EditGalleryImage | null {
  if (!isRecord(value)) return null;
  const imageUrl = text(value.imageUrl, 1000);
  if (!imageUrl) return null;
  return {
    id: id(value.id),
    imageUrl,
    caption: optionalText(value.caption, EDIT_LIMITS.caption.max),
    displayOrder: number(value.displayOrder) ?? index + 1,
  };
}

export type ParsedDraft = { ok: true; draft: EditPackageFormData } | { ok: false; error: string };

/** Rebuilds a draft from untrusted input, or explains what was wrong with it. */
export function parseDraftPayload(input: unknown): ParsedDraft {
  if (!isRecord(input)) {
    return { ok: false, error: "The package details could not be read. Reload the page and try again." };
  }

  const durationType = input.durationType === "hours" ? "hours" : input.durationType === "days" ? "days" : null;
  if (!durationType) {
    return { ok: false, error: "Choose hours or days for the tour length." };
  }

  const durationValue = number(input.durationValue);
  if (durationValue === null) {
    return { ok: false, error: "Enter how long the tour takes." };
  }

  const priceVariants = list(input.priceVariants, MAX_ITEMS.priceVariants)
    .map(parseVariant)
    .filter((variant): variant is EditPriceVariant => variant !== null);

  if (priceVariants.filter((variant) => variant.isDefault).length > 1) {
    return { ok: false, error: "Mark only one price option as the default." };
  }

  const inclusions = list(input.inclusions, MAX_ITEMS.inclusions)
    .map(parseInclusion)
    .filter((item): item is EditInclusion => item !== null);

  const stops = list(input.stops, MAX_ITEMS.stops)
    .map(parseStop)
    .filter((stop): stop is EditStop => stop !== null);

  const galleryImages = list(input.galleryImages, MAX_ITEMS.gallery)
    .map(parseGalleryImage)
    .filter((image): image is EditGalleryImage => image !== null);

  return {
    ok: true,
    draft: {
      title: text(input.title, EDIT_LIMITS.title.max) ?? "",
      locationName: text(input.locationName, EDIT_LIMITS.locationName.max) ?? "",
      description: optionalText(input.description, EDIT_LIMITS.description.max),
      durationValue,
      durationType,
      coverImageUrl: optionalText(input.coverImageUrl, 1000),
      priceVariants,
      inclusions,
      stops,
      galleryImages,
    },
  };
}
