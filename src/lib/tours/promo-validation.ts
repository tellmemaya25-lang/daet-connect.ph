import { manilaLocalToIso, MAX_EVENT_SPAN_DAYS } from "@/lib/tours/events-calendar";

/** Shared contract and validation for the events calendar and merchandise showcase. */

export const EVENT_CATEGORIES = {
  festival: "Festival",
  cultural: "Cultural",
  sports: "Sports",
  religious: "Religious",
  market: "Market / Bazaar",
  other: "Other",
} as const;
export type EventCategory = keyof typeof EVENT_CATEGORIES;

export const MERCH_CATEGORIES = {
  tshirt: "T-shirts",
  mug: "Mugs",
  souvenir: "Souvenirs",
  accessory: "Accessories",
  pasalubong: "Pasalubong",
  other: "Other",
} as const;
export type MerchCategory = keyof typeof MERCH_CATEGORIES;

export function isEventCategory(value: unknown): value is EventCategory {
  return typeof value === "string" && Object.hasOwn(EVENT_CATEGORIES, value);
}

export function isMerchCategory(value: unknown): value is MerchCategory {
  return typeof value === "string" && Object.hasOwn(MERCH_CATEGORIES, value);
}

export type TourEvent = {
  id: string;
  title: string;
  description: string | null;
  category: EventCategory;
  venue: string;
  organizer: string | null;
  starts_at: string;
  ends_at: string;
  image_url: string | null;
  is_published: boolean;
};

export type MerchItem = {
  id: string;
  name: string;
  description: string | null;
  category: MerchCategory;
  price: number | null;
  seller_name: string;
  where_to_buy: string | null;
  contact_info: string | null;
  image_url: string | null;
  is_featured: boolean;
  is_active: boolean;
};

export const EVENT_COLUMNS =
  "id,title,description,category,venue,organizer,starts_at,ends_at,image_url,is_published";
export const MERCH_COLUMNS =
  "id,name,description,category,price,seller_name,where_to_buy,contact_info,image_url,is_featured,is_active";

export type EventInput = Omit<TourEvent, "id" | "image_url">;
export type MerchInput = Omit<MerchItem, "id" | "image_url">;

export type FieldErrors = Record<string, string>;

/** State returned by the admin save actions to `useActionState`. */
export type PromoFormState = { message: string | null; errors: FieldErrors };
export const INITIAL_PROMO_FORM_STATE: PromoFormState = { message: null, errors: {} };
export type ParseResult<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(formData: FormData, name: string): string | null {
  return text(formData, name) || null;
}

function checkbox(formData: FormData, name: string): boolean {
  const value = formData.get(name);
  return value === "on" || value === "true";
}

function checkLength(errors: FieldErrors, field: string, value: string | null, label: string, min: number, max: number) {
  const length = value?.length ?? 0;
  if (min > 0 && length < min) errors[field] = length === 0 ? `${label} is required.` : `${label} must be at least ${min} characters.`;
  else if (length > max) errors[field] = `${label} must be ${max} characters or fewer.`;
}

export function parseEventForm(formData: FormData): ParseResult<EventInput> {
  const errors: FieldErrors = {};

  const title = text(formData, "title");
  const description = optionalText(formData, "description");
  const venue = text(formData, "venue");
  const organizer = optionalText(formData, "organizer");
  const category = text(formData, "category");

  checkLength(errors, "title", title, "Title", 3, 120);
  checkLength(errors, "description", description, "Description", 0, 2000);
  checkLength(errors, "venue", venue, "Venue", 2, 160);
  checkLength(errors, "organizer", organizer, "Organizer", 0, 120);
  if (!isEventCategory(category)) errors.category = "Choose an event category.";

  const startsAt = manilaLocalToIso(text(formData, "startsAt"));
  const endsAt = manilaLocalToIso(text(formData, "endsAt"));
  if (!startsAt) errors.startsAt = "Enter a valid start date and time.";
  if (!endsAt) errors.endsAt = "Enter a valid end date and time.";
  if (startsAt && endsAt) {
    const span = Date.parse(endsAt) - Date.parse(startsAt);
    if (span < 0) errors.endsAt = "End must be on or after the start.";
    else if (span > MAX_EVENT_SPAN_DAYS * 24 * 60 * 60 * 1000) {
      errors.endsAt = `Events can span at most ${MAX_EVENT_SPAN_DAYS} days.`;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      title,
      description,
      category: category as EventCategory,
      venue,
      organizer,
      starts_at: startsAt!,
      ends_at: endsAt!,
      is_published: checkbox(formData, "isPublished"),
    },
  };
}

export function parseMerchForm(formData: FormData): ParseResult<MerchInput> {
  const errors: FieldErrors = {};

  const name = text(formData, "name");
  const description = optionalText(formData, "description");
  const category = text(formData, "category");
  const sellerName = text(formData, "sellerName");
  const whereToBuy = optionalText(formData, "whereToBuy");
  const contactInfo = optionalText(formData, "contactInfo");
  const priceText = text(formData, "price");

  checkLength(errors, "name", name, "Product name", 2, 120);
  checkLength(errors, "description", description, "Description", 0, 1000);
  checkLength(errors, "sellerName", sellerName, "Seller name", 2, 120);
  checkLength(errors, "whereToBuy", whereToBuy, "Where to buy", 0, 200);
  checkLength(errors, "contactInfo", contactInfo, "Contact info", 0, 200);
  if (!isMerchCategory(category)) errors.category = "Choose a product category.";

  let price: number | null = null;
  if (priceText) {
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(priceText)) {
      errors.price = "Enter a price in pesos, e.g. 350 or 349.50.";
    } else {
      price = Number(priceText);
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      name,
      description,
      category: category as MerchCategory,
      price,
      seller_name: sellerName,
      where_to_buy: whereToBuy,
      contact_info: contactInfo,
      is_featured: checkbox(formData, "isFeatured"),
      is_active: checkbox(formData, "isActive"),
    },
  };
}

export const PROMO_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PROMO_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Returns the uploaded image, `null` when none was chosen, or an error message. */
export function readPromoImage(formData: FormData): { file: File | null; error?: string } {
  const value = formData.get("image");
  if (!value || typeof value === "string" || value.size === 0) return { file: null };
  if (!(PROMO_IMAGE_TYPES as readonly string[]).includes(value.type)) {
    return { file: null, error: "Image must be a JPG, PNG, or WebP file." };
  }
  if (value.size > PROMO_IMAGE_MAX_BYTES) {
    return { file: null, error: "Image must be 5 MB or smaller." };
  }
  return { file: value };
}

export function formatPeso(value: number | null): string | null {
  if (value === null) return null;
  return `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
