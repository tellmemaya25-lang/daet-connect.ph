import type { EditPackageFormData } from "./edit-types";

/** Treats "", null and undefined as the same "empty" value for optional text. */
function normalizeOptionalText(value: string | null | undefined): string | null {
  return value === undefined || value === null || value === "" ? null : value;
}

function normalize(data: EditPackageFormData) {
  return {
    title: data.title,
    locationName: data.locationName,
    description: normalizeOptionalText(data.description),
    durationValue: data.durationValue,
    durationType: data.durationType,
    coverImageUrl: normalizeOptionalText(data.coverImageUrl),
    priceVariants: data.priceVariants.map((variant) => ({
      id: variant.id ?? null,
      variantName: variant.variantName,
      minPax: variant.minPax,
      maxPax: variant.maxPax ?? null,
      pricePerPax: variant.pricePerPax ?? null,
      flatPrice: variant.flatPrice ?? null,
      isDefault: variant.isDefault,
    })),
    inclusions: data.inclusions.map((item) => ({
      id: item.id ?? null,
      text: item.text,
      isIncluded: item.isIncluded,
      displayOrder: item.displayOrder,
    })),
    stops: data.stops.map((stop) => ({
      id: stop.id ?? null,
      locationName: stop.locationName,
      description: normalizeOptionalText(stop.description),
      latitude: stop.latitude,
      longitude: stop.longitude,
      estimatedDurationMinutes: stop.estimatedDurationMinutes ?? null,
      stopOrder: stop.stopOrder,
    })),
    galleryImages: data.galleryImages.map((image) => ({
      id: image.id ?? null,
      imageUrl: image.imageUrl,
      caption: normalizeOptionalText(image.caption),
      displayOrder: image.displayOrder,
    })),
  };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => deepEqual(value, b[index]));
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const keys = Object.keys(aRecord);
  if (keys.length !== Object.keys(bRecord).length) return false;
  return keys.every((key) => deepEqual(aRecord[key], bRecord[key]));
}

/** True when the form differs from the originally loaded data. */
export function detectChanges(original: EditPackageFormData, current: EditPackageFormData): boolean {
  return !deepEqual(normalize(original), normalize(current));
}

/** Generic structural comparison for a single section slice. */
export function sectionChanged<T>(original: T, current: T): boolean {
  return !deepEqual(original, current);
}

/**
 * Parses an ISO / Postgres timestamp into [epochMs, extraMicros] so values
 * with microsecond precision are compared exactly.
 */
function parseTimestamp(value: string): [number, number] | null {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  const fraction = /\.(\d+)/.exec(value)?.[1] ?? "";
  const micros = Number(fraction.padEnd(6, "0").slice(3, 6));
  return [ms, micros];
}

/** True when the database timestamp differs from the one cached by the client. */
export function hasConcurrencyConflict(currentUpdatedAt: string | null, cachedUpdatedAt: string | null): boolean {
  if (!currentUpdatedAt || !cachedUpdatedAt) return true;
  const current = parseTimestamp(currentUpdatedAt);
  const cached = parseTimestamp(cachedUpdatedAt);
  if (!current || !cached) return true;
  return current[0] !== cached[0] || current[1] !== cached[1];
}
