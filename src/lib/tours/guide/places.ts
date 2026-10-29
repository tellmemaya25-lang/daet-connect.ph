import { haversineMeters, type LatLng } from "@/lib/maps/geo";
import { slugify } from "@/lib/tours/attractions";
import { openStatus, parseHoursText, parseOpeningHours, type OpenStatus, type OpeningHours } from "@/lib/tours/opening-hours";

/** The Daet local guide directory (tours_guide_places): where to eat, stay, ride, meet or get help. */

export const GUIDE_PLACE_KINDS = {
  eatery: "Food",
  lodging: "Place to stay",
  terminal: "Terminal",
  pasalubong: "Pasalubong",
  meeting_point: "Meeting point",
  service: "Help and services",
} as const;
export type GuidePlaceKind = keyof typeof GUIDE_PLACE_KINDS;

export const PRICE_UNITS = { meal: "per meal", night: "per night", trip: "per trip", item: "per item" } as const;
export type PriceUnit = keyof typeof PRICE_UNITS;

export function isGuidePlaceKind(value: unknown): value is GuidePlaceKind {
  return typeof value === "string" && value in GUIDE_PLACE_KINDS;
}

export type GuidePlace = {
  id: string;
  kind: GuidePlaceKind;
  name: string;
  slug: string;
  description: string | null;
  municipality: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  location_verified: boolean;
  price_min: number | null;
  price_max: number | null;
  price_unit: PriceUnit | null;
  specialties: string[];
  tags: string[];
  opening_hours: OpeningHours | null;
  phone: string | null;
  source: string;
  checked_on: string;
  verified: boolean;
  is_active: boolean;
};

export const GUIDE_PLACE_COLUMNS =
  "id,kind,name,slug,description,municipality,address,latitude,longitude,location_verified,price_min,price_max,price_unit,specialties,tags,opening_hours,phone,source,checked_on,verified,is_active";

const num = (value: unknown) => (value === null || value === undefined || value === "" ? null : Number(value));

/** Supabase returns numeric columns as strings; normalise a row. */
export function toGuidePlace(row: Record<string, unknown>): GuidePlace {
  return {
    ...(row as unknown as GuidePlace),
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    price_min: num(row.price_min),
    price_max: num(row.price_max),
    specialties: Array.isArray(row.specialties) ? (row.specialties as string[]) : [],
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    opening_hours: parseOpeningHours(row.opening_hours),
  };
}

export function placePoint(place: Pick<GuidePlace, "latitude" | "longitude">): LatLng | null {
  return place.latitude !== null && place.longitude !== null ? { lat: place.latitude, lng: place.longitude } : null;
}

export function placeOpenStatus(place: Pick<GuidePlace, "opening_hours">, at: Date = new Date()): OpenStatus {
  return openStatus(place.opening_hours, at);
}

/** "₱650 per night", "₱150–₱300 per meal", or null when no price is known. */
export function priceLabel(place: Pick<GuidePlace, "price_min" | "price_max" | "price_unit">, format: (n: number) => string): string | null {
  const { price_min: lo, price_max: hi, price_unit: unit } = place;
  if (lo === null && hi === null) return null;
  const per = unit ? ` ${PRICE_UNITS[unit]}` : "";
  if (lo !== null && hi !== null && lo !== hi) return `${format(lo)}–${format(hi)}${per}`;
  if (lo !== null && hi === null) return `from ${format(lo)}${per}`;
  return `${format((lo ?? hi) as number)}${per}`;
}

/** Places nearest first; places without a pin go last, in name order. */
export function sortByDistance<T extends Pick<GuidePlace, "latitude" | "longitude" | "name">>(places: T[], from: LatLng | null): Array<T & { distanceM: number | null }> {
  return places
    .map((p) => {
      const point = placePoint(p);
      return { ...p, distanceM: from && point ? haversineMeters(from, point) : null };
    })
    .sort((a, b) => {
      if (a.distanceM === null && b.distanceM === null) return a.name.localeCompare(b.name);
      if (a.distanceM === null) return 1;
      if (b.distanceM === null) return -1;
      return a.distanceM - b.distanceM;
    });
}

/** Distance from a point to the straight segment a→b, in metres (good enough for "on the way"). */
export function distanceToSegmentM(p: LatLng, a: LatLng, b: LatLng): number {
  const toXY = (q: LatLng) => ({ x: q.lng * 111_320 * Math.cos((a.lat * Math.PI) / 180), y: q.lat * 110_540 });
  const P = toXY(p);
  const A = toXY(a);
  const B = toXY(b);
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((P.x - A.x) * dx + (P.y - A.y) * dy) / len2));
  return Math.hypot(P.x - (A.x + t * dx), P.y - (A.y + t * dy));
}

// ---- admin form and CSV import ----

export type GuidePlaceInput = Omit<GuidePlace, "id">;
export type FieldErrors = Record<string, string>;
export type RawGuidePlace = Partial<Record<
  "kind" | "name" | "slug" | "description" | "municipality" | "address" | "latitude" | "longitude" | "priceMin" | "priceMax" | "priceUnit" | "specialties" | "tags" | "hours" | "phone" | "source" | "checkedOn",
  string
>> & { locationVerified?: boolean; verified?: boolean; isActive?: boolean };

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const peso = (value: string) => value.replace(/^₱/, "").replace(/,/g, "").trim();
const list = (value: string | undefined) =>
  (value ?? "")
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);

export function validateGuidePlace(raw: RawGuidePlace, today: string): { ok: true; data: GuidePlaceInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const text = (value: string | undefined) => (value ?? "").trim();
  const optional = (value: string | undefined, max: number, field: string) => {
    const v = text(value);
    if (v.length > max) errors[field] = `Keep this under ${max} characters.`;
    return v || null;
  };

  const kind = text(raw.kind);
  if (!isGuidePlaceKind(kind)) errors.kind = "Choose what kind of place this is.";
  const name = text(raw.name);
  if (name.length < 2 || name.length > 120) errors.name = "Name must be 2 to 120 characters.";
  const slug = text(raw.slug) || slugify(name);
  if (!SLUG.test(slug) || slug.length > 80) errors.slug = "Use lowercase letters, numbers and dashes.";
  const municipality = text(raw.municipality) || "Daet";
  if (municipality.length > 60) errors.municipality = "Keep this under 60 characters.";

  const latText = text(raw.latitude);
  const lngText = text(raw.longitude);
  let latitude: number | null = null;
  let longitude: number | null = null;
  if (latText || lngText) {
    latitude = Number(latText);
    longitude = Number(lngText);
    if (!latText || !Number.isFinite(latitude)) errors.latitude = "Enter a latitude like 14.1131 (or leave both empty).";
    if (!lngText || !Number.isFinite(longitude)) errors.longitude = "Enter a longitude like 122.9545 (or leave both empty).";
    if (!errors.latitude && !errors.longitude && (latitude < 12 || latitude > 16 || longitude < 121 || longitude > 125)) {
      errors.latitude = "This pin is far from Camarines Norte. Check that latitude and longitude are not swapped.";
    }
  }

  const priceNum = (value: string | undefined, field: string) => {
    const v = peso(text(value));
    if (!v) return null;
    if (!/^\d+(\.\d{1,2})?$/.test(v) || Number(v) > 1_000_000) {
      errors[field] = "Enter an amount in pesos, e.g. 250.";
      return null;
    }
    return Number(v);
  };
  const priceMin = priceNum(raw.priceMin, "priceMin");
  const priceMax = priceNum(raw.priceMax, "priceMax");
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) errors.priceMax = "The highest price must not be below the lowest.";
  const unitText = text(raw.priceUnit);
  const priceUnit = unitText ? unitText : null;
  if (priceUnit && !(priceUnit in PRICE_UNITS)) errors.priceUnit = "Choose per meal, night, trip or item.";
  if ((priceMin !== null || priceMax !== null) && !priceUnit) errors.priceUnit = "Say what the price is for.";

  const hours = parseHoursText(text(raw.hours));
  if (!hours.ok) errors.hours = hours.error;

  const source = text(raw.source);
  if (source.length < 3 || source.length > 500) errors.source = "Say where this information comes from (e.g. Daet Tourism Office, 2026).";
  const checkedOn = text(raw.checkedOn) || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkedOn)) errors.checkedOn = "Use a date like 2026-10-29.";

  const description = optional(raw.description, 1000, "description");
  const address = optional(raw.address, 200, "address");
  const phone = optional(raw.phone, 40, "phone");

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      kind: kind as GuidePlaceKind,
      name,
      slug,
      description,
      municipality,
      address,
      latitude,
      longitude,
      location_verified: Boolean(raw.locationVerified) && latitude !== null,
      price_min: priceMin,
      price_max: priceMax,
      price_unit: priceUnit as PriceUnit | null,
      specialties: list(raw.specialties),
      tags: list(raw.tags),
      opening_hours: hours.ok ? hours.hours : null,
      phone,
      source,
      checked_on: checkedOn,
      verified: Boolean(raw.verified),
      is_active: raw.isActive ?? true,
    },
  };
}
