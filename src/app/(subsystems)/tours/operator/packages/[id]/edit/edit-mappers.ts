import type {
  DurationType,
  EditGalleryImage,
  EditInclusion,
  EditPackageFormData,
  EditPackageRecord,
  EditPackageStatus,
  EditPriceVariant,
  EditStop,
} from "./edit-types";

/** Columns needed to build the edit form. */
export const EDIT_PACKAGE_SELECT = [
  "id,operator_id,title,description,location_name,duration_value,duration_type,cover_image_url,status,rejection_reason,updated_at",
  "tours_package_price_variants(id,variant_name,min_pax,max_pax,price_per_pax,flat_price,is_default,created_at)",
  "tours_package_inclusions(id,item_text,is_included,display_order)",
  "tours_package_stops(id,stop_order,location_name,description,latitude,longitude,estimated_duration_minutes)",
  "tours_package_gallery(id,image_url,caption,display_order)",
].join(",");

type Row = Record<string, unknown>;

const STATUSES: EditPackageStatus[] = ["draft", "pending_review", "published", "rejected", "archived"];

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function rows(value: unknown): Row[] {
  return Array.isArray(value) ? (value.filter((item) => item && typeof item === "object") as Row[]) : [];
}
function byNumber<T>(key: (item: T) => number) {
  return (a: T, b: T) => key(a) - key(b);
}

/** Normalizes a Supabase row (with relations) into the edit form shape. Orders are rewritten to 1..n. */
export function mapPackageRowToRecord(row: Row): EditPackageRecord {
  const status = STATUSES.includes(row.status as EditPackageStatus)
    ? (row.status as EditPackageStatus)
    : "draft";

  const priceVariants: EditPriceVariant[] = rows(row.tours_package_price_variants)
    .sort((a, b) => str(a.created_at).localeCompare(str(b.created_at)))
    .map((variant) => ({
      id: str(variant.id),
      variantName: str(variant.variant_name),
      minPax: num(variant.min_pax) || 1,
      maxPax: numOrNull(variant.max_pax),
      pricePerPax: numOrNull(variant.price_per_pax),
      flatPrice: numOrNull(variant.flat_price),
      isDefault: variant.is_default === true,
    }));

  const inclusions: EditInclusion[] = rows(row.tours_package_inclusions)
    .map((item, index) => ({ item, order: numOrNull(item.display_order) ?? index + 1 }))
    .sort(byNumber((entry) => entry.order))
    .map(({ item }, index) => ({
      id: str(item.id),
      text: str(item.item_text),
      isIncluded: item.is_included !== false,
      displayOrder: index + 1,
    }));

  const stops: EditStop[] = rows(row.tours_package_stops)
    .sort(byNumber((stop) => num(stop.stop_order)))
    .map((stop, index) => ({
      id: str(stop.id),
      locationName: str(stop.location_name),
      description: strOrNull(stop.description),
      latitude: num(stop.latitude),
      longitude: num(stop.longitude),
      estimatedDurationMinutes: numOrNull(stop.estimated_duration_minutes),
      stopOrder: index + 1,
    }));

  const galleryImages: EditGalleryImage[] = rows(row.tours_package_gallery)
    .sort(byNumber((image) => num(image.display_order)))
    .map((image, index) => ({
      id: str(image.id),
      imageUrl: str(image.image_url),
      caption: strOrNull(image.caption),
      displayOrder: index + 1,
    }));

  const formData: EditPackageFormData = {
    title: str(row.title),
    locationName: str(row.location_name),
    description: strOrNull(row.description),
    durationValue: num(row.duration_value),
    durationType: row.duration_type === "days" ? "days" : "hours",
    coverImageUrl: strOrNull(row.cover_image_url),
    priceVariants,
    inclusions,
    stops,
    galleryImages,
  };

  return {
    id: str(row.id),
    status,
    rejectionReason: strOrNull(row.rejection_reason),
    updatedAt: str(row.updated_at),
    formData,
  };
}

/* ------------------------------------------------------- untrusted input */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function optionalId(value: unknown): string | undefined | false {
  if (value === undefined || value === null || value === "") return undefined;
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : false;
}
function finiteOrNaN(value: unknown): number {
  return typeof value === "number" ? value : Number.NaN;
}
function finiteOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : finiteOrNaN(value);
}
function textOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Coerces untrusted server-action input into EditPackageFormData, stripping
 * unknown keys. Returns an error when the overall shape is wrong; field-level
 * problems are left to validateEditForm.
 */
export function parseEditFormInput(raw: unknown): { data: EditPackageFormData } | { error: string } {
  if (!isRecord(raw)) return { error: "Package details are invalid." };
  const lists = ["priceVariants", "inclusions", "stops", "galleryImages"] as const;
  for (const list of lists) {
    if (!Array.isArray(raw[list]) || !(raw[list] as unknown[]).every(isRecord)) {
      return { error: "Package details are invalid." };
    }
  }

  let badId = false;
  const id = (value: unknown) => {
    const parsed = optionalId(value);
    if (parsed === false) {
      badId = true;
      return undefined;
    }
    return parsed;
  };

  const data: EditPackageFormData = {
    title: typeof raw.title === "string" ? raw.title : "",
    locationName: typeof raw.locationName === "string" ? raw.locationName : "",
    description: textOrNull(raw.description),
    durationValue: finiteOrNaN(raw.durationValue),
    durationType: (raw.durationType === "days" || raw.durationType === "hours"
      ? raw.durationType
      : "invalid") as DurationType,
    coverImageUrl: textOrNull(raw.coverImageUrl),
    priceVariants: (raw.priceVariants as Row[]).map((variant) => ({
      id: id(variant.id),
      variantName: typeof variant.variantName === "string" ? variant.variantName : "",
      minPax: finiteOrNaN(variant.minPax),
      maxPax: finiteOrNull(variant.maxPax),
      pricePerPax: finiteOrNull(variant.pricePerPax),
      flatPrice: finiteOrNull(variant.flatPrice),
      isDefault: variant.isDefault === true,
    })),
    inclusions: (raw.inclusions as Row[]).map((item) => ({
      id: id(item.id),
      text: typeof item.text === "string" ? item.text : "",
      isIncluded: item.isIncluded !== false,
      displayOrder: finiteOrNaN(item.displayOrder),
    })),
    stops: (raw.stops as Row[]).map((stop) => ({
      id: id(stop.id),
      locationName: typeof stop.locationName === "string" ? stop.locationName : "",
      description: textOrNull(stop.description),
      latitude: finiteOrNaN(stop.latitude),
      longitude: finiteOrNaN(stop.longitude),
      estimatedDurationMinutes: finiteOrNull(stop.estimatedDurationMinutes),
      stopOrder: finiteOrNaN(stop.stopOrder),
    })),
    galleryImages: (raw.galleryImages as Row[]).map((image) => ({
      id: id(image.id),
      imageUrl: typeof image.imageUrl === "string" ? image.imageUrl : "",
      caption: textOrNull(image.caption),
      displayOrder: finiteOrNaN(image.displayOrder),
    })),
  };

  if (badId) return { error: "An item identifier is invalid." };
  return { data };
}

/* ------------------------------------------------------ RPC payload shape */

function trimOrNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/** Snake_case payloads for the update_package_and_relations RPC. */
export function toRpcPayload(data: EditPackageFormData) {
  return {
    p_package_data: {
      title: data.title.trim(),
      location_name: data.locationName.trim(),
      description: trimOrNull(data.description),
      duration_value: data.durationValue,
      duration_type: data.durationType,
      cover_image_url: trimOrNull(data.coverImageUrl),
    },
    p_price_variants: data.priceVariants.map((variant) => ({
      variant_name: variant.variantName.trim(),
      min_pax: variant.minPax,
      max_pax: variant.maxPax,
      price_per_pax: variant.pricePerPax,
      flat_price: variant.flatPrice,
      is_default: variant.isDefault,
    })),
    p_inclusions: [...data.inclusions]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((item, index) => ({
        item_text: item.text.trim(),
        is_included: item.isIncluded,
        display_order: index + 1,
      })),
    p_stops: [...data.stops]
      .sort((a, b) => a.stopOrder - b.stopOrder)
      .map((stop, index) => ({
        location_name: stop.locationName.trim(),
        description: trimOrNull(stop.description),
        latitude: stop.latitude,
        longitude: stop.longitude,
        estimated_duration_minutes: stop.estimatedDurationMinutes,
        stop_order: index + 1,
      })),
    p_gallery: [...data.galleryImages]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((image, index) => ({
        image_url: image.imageUrl.trim(),
        caption: trimOrNull(image.caption),
        display_order: index + 1,
      })),
  };
}

/** Image URLs referenced by a form (cover + gallery). */
export function referencedImageUrls(data: EditPackageFormData): Set<string> {
  const urls = new Set<string>();
  if (data.coverImageUrl) urls.add(data.coverImageUrl);
  data.galleryImages.forEach((image) => urls.add(image.imageUrl));
  return urls;
}
