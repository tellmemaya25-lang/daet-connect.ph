import { parseHoursText, parseOpeningHours, type OpeningHours } from "@/lib/tours/opening-hours";

/** Daet tourism dataset (tours_attractions): validation shared by the admin form and the CSV import. */

export const ATTRACTION_CATEGORIES = {
  beach: "Beach",
  heritage: "Heritage",
  nature: "Nature",
  park: "Park & plaza",
  food: "Food",
  adventure: "Adventure",
  shopping: "Shopping",
  religious: "Church",
} as const;
export type AttractionCategory = keyof typeof ATTRACTION_CATEGORIES;


export function isAttractionCategory(value: unknown): value is AttractionCategory {
  return typeof value === "string" && value in ATTRACTION_CATEGORIES;
}

export type Attraction = {
  id: string;
  name: string;
  slug: string;
  category: AttractionCategory;
  description: string | null;
  municipality: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  location_verified: boolean;
  opening_hours: OpeningHours | null;
  hours_note: string | null;
  dwell_minutes: number | null;
  entrance_fee: number | null;
  photo_url: string | null;
  source: string;
  is_active: boolean;
};

export const ATTRACTION_COLUMNS =
  "id,name,slug,category,description,municipality,address,latitude,longitude,location_verified,opening_hours,hours_note,dwell_minutes,entrance_fee,photo_url,source,is_active";

/** Supabase returns numeric columns as strings; normalise a row for the UI. */
export function toAttraction(row: Record<string, unknown>): Attraction {
  const num = (value: unknown) => (value === null || value === undefined || value === "" ? null : Number(value));
  return {
    ...(row as unknown as Attraction),
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    entrance_fee: num(row.entrance_fee),
    dwell_minutes: num(row.dwell_minutes),
    opening_hours: parseOpeningHours(row.opening_hours),
  };
}

export type AttractionInput = Omit<Attraction, "id" | "photo_url">;
export type FieldErrors = Record<string, string>;

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Field values by name, as strings (from a form or a CSV row). */
export type RawAttraction = Partial<Record<
  "name" | "slug" | "category" | "description" | "municipality" | "address" | "latitude" | "longitude" | "hours" | "hoursNote" | "dwellMinutes" | "entranceFee" | "source",
  string
>> & { locationVerified?: boolean; isActive?: boolean };

export function validateAttraction(raw: RawAttraction): { ok: true; data: AttractionInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const text = (value: string | undefined) => (value ?? "").trim();
  const optional = (value: string | undefined, max: number, field: string) => {
    const v = text(value);
    if (v.length > max) errors[field] = `Keep this under ${max} characters.`;
    return v || null;
  };

  const name = text(raw.name);
  if (name.length < 2 || name.length > 120) errors.name = "Name must be 2 to 120 characters.";
  const slug = text(raw.slug) || slugify(name);
  if (!SLUG.test(slug) || slug.length > 80) errors.slug = "Use lowercase letters, numbers and dashes (e.g. bagasbas-beach).";
  const category = text(raw.category);
  if (!isAttractionCategory(category)) errors.category = "Choose a category.";
  const municipality = text(raw.municipality) || "Daet";
  if (municipality.length > 60) errors.municipality = "Keep this under 60 characters.";

  const latText = text(raw.latitude);
  const lngText = text(raw.longitude);
  let latitude: number | null = null;
  let longitude: number | null = null;
  if (latText || lngText) {
    latitude = Number(latText);
    longitude = Number(lngText);
    if (!latText || !Number.isFinite(latitude) || Math.abs(latitude) > 90) errors.latitude = "Enter a latitude like 14.1131 (or leave both empty).";
    if (!lngText || !Number.isFinite(longitude) || Math.abs(longitude) > 180) errors.longitude = "Enter a longitude like 122.9545 (or leave both empty).";
    // Camarines Norte sits around 13.8–14.6 N, 122.3–123.3 E; catch swapped or typo'd pins.
    if (!errors.latitude && !errors.longitude && (latitude < 12 || latitude > 16 || longitude < 121 || longitude > 125)) {
      errors.latitude = "This pin is far from Camarines Norte. Check that latitude and longitude are not swapped.";
    }
  }

  const hours = parseHoursText(text(raw.hours));
  if (!hours.ok) errors.hours = hours.error;

  const dwellText = text(raw.dwellMinutes);
  const dwell = dwellText ? Number(dwellText) : null;
  if (dwell !== null && (!Number.isInteger(dwell) || dwell < 5 || dwell > 720)) errors.dwellMinutes = "Typical visit length must be 5 to 720 minutes.";

  const feeText = text(raw.entranceFee).replace(/^₱/, "").replace(/,/g, "");
  const fee = feeText ? Number(feeText) : null;
  if (fee !== null && (!/^\d+(\.\d{1,2})?$/.test(feeText) || fee > 100000)) errors.entranceFee = "Enter the fee in pesos, e.g. 50 or 0 for free.";

  const source = text(raw.source);
  if (source.length < 3 || source.length > 500) errors.source = "Say where this information comes from (e.g. Daet Tourism Office, 2026).";

  const description = optional(raw.description, 2000, "description");
  const address = optional(raw.address, 200, "address");
  const hoursNote = optional(raw.hoursNote, 200, "hoursNote");

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      name,
      slug,
      category: category as AttractionCategory,
      description,
      municipality,
      address,
      latitude,
      longitude,
      location_verified: Boolean(raw.locationVerified) && latitude !== null,
      opening_hours: hours.ok ? hours.hours : null,
      hours_note: hoursNote,
      dwell_minutes: dwell,
      entrance_fee: fee,
      source,
      is_active: raw.isActive ?? true,
    },
  };
}

export function parseAttractionForm(formData: FormData) {
  const get = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : undefined;
  };
  return validateAttraction({
    name: get("name"), slug: get("slug"), category: get("category"), description: get("description"),
    municipality: get("municipality"), address: get("address"), latitude: get("latitude"), longitude: get("longitude"),
    hours: get("hours"), hoursNote: get("hoursNote"), dwellMinutes: get("dwellMinutes"), entranceFee: get("entranceFee"),
    source: get("source"), locationVerified: formData.get("locationVerified") === "on", isActive: formData.get("isActive") === "on",
  });
}

/** Minimal RFC 4180 CSV parser (quoted fields, doubled quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export const CSV_COLUMNS = ["name", "category", "municipality", "address", "latitude", "longitude", "hours", "hours_note", "dwell_minutes", "entrance_fee", "description", "source", "slug"] as const;
export const CSV_MAX_ROWS = 300;

const CSV_TO_RAW: Record<string, keyof RawAttraction> = {
  name: "name", category: "category", municipality: "municipality", address: "address", latitude: "latitude", longitude: "longitude",
  hours: "hours", hours_note: "hoursNote", dwell_minutes: "dwellMinutes", entrance_fee: "entranceFee", description: "description",
  source: "source", slug: "slug",
};

export type CsvImportResult = { rows: AttractionInput[]; errors: Array<{ line: number; message: string }> };

/** Validates every row; the import saves nothing unless all rows pass. */
export function parseAttractionsCsv(text: string): CsvImportResult {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], errors: [{ line: 1, message: "The file needs a header row and at least one attraction." }] };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const missing = ["name", "category", "source"].filter((col) => !header.includes(col));
  if (missing.length) return { rows: [], errors: [{ line: 1, message: `Missing column(s): ${missing.join(", ")}. Expected: ${CSV_COLUMNS.join(", ")}.` }] };
  if (table.length - 1 > CSV_MAX_ROWS) return { rows: [], errors: [{ line: 1, message: `Import at most ${CSV_MAX_ROWS} rows at a time.` }] };

  const rows: AttractionInput[] = [];
  const errors: CsvImportResult["errors"] = [];
  const slugs = new Map<string, number>();
  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const raw: RawAttraction = {};
    header.forEach((col, i) => {
      const key = CSV_TO_RAW[col];
      if (key && key !== "locationVerified" && key !== "isActive") (raw as Record<string, string>)[key] = cells[i] ?? "";
    });
    raw.category = (raw.category ?? "").trim().toLowerCase();
    const result = validateAttraction(raw);
    if (!result.ok) {
      errors.push({ line, message: Object.entries(result.errors).map(([field, msg]) => `${field}: ${msg}`).join(" ") });
      return;
    }
    const seen = slugs.get(result.data.slug);
    if (seen) {
      errors.push({ line, message: `slug "${result.data.slug}" repeats line ${seen}.` });
      return;
    }
    slugs.set(result.data.slug, line);
    rows.push(result.data);
  });
  return { rows, errors };
}
