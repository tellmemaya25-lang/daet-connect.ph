import { parseCsv } from "@/lib/tours/attractions";
import { validateFare, type FareInput, type RawFare } from "@/lib/tours/guide/fares";
import { validateGuidePlace, type GuidePlaceInput, type RawGuidePlace } from "@/lib/tours/guide/places";

/** Form and CSV readers for the local guide directory admin. */

const field = (formData: FormData) => (key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
};

export function parseGuidePlaceForm(formData: FormData, today: string) {
  const get = field(formData);
  return validateGuidePlace(
    {
      kind: get("kind"), name: get("name"), slug: get("slug"), description: get("description"), municipality: get("municipality"),
      address: get("address"), latitude: get("latitude"), longitude: get("longitude"), priceMin: get("priceMin"), priceMax: get("priceMax"),
      priceUnit: get("priceUnit"), specialties: get("specialties"), tags: get("tags"), hours: get("hours"), phone: get("phone"),
      source: get("source"), checkedOn: get("checkedOn"),
      locationVerified: formData.get("locationVerified") === "on", verified: formData.get("verified") === "on", isActive: formData.get("isActive") === "on",
    },
    today,
  );
}

export function parseFareForm(formData: FormData, today: string) {
  const get = field(formData);
  return validateFare(
    {
      mode: get("mode"), fromName: get("fromName"), toName: get("toName"), fareMin: get("fareMin"), fareMax: get("fareMax"), farePer: get("farePer"),
      minutesMin: get("minutesMin"), minutesMax: get("minutesMax"), scheduleNote: get("scheduleNote"), source: get("source"), checkedOn: get("checkedOn"),
      verified: formData.get("verified") === "on", isActive: formData.get("isActive") === "on",
    },
    today,
  );
}

export const PLACE_CSV_COLUMNS = ["kind", "name", "municipality", "address", "latitude", "longitude", "price_min", "price_max", "price_unit", "specialties", "tags", "hours", "phone", "description", "source", "checked_on", "slug"] as const;
export const FARE_CSV_COLUMNS = ["mode", "from", "to", "fare_min", "fare_max", "fare_per", "minutes_min", "minutes_max", "schedule_note", "source", "checked_on"] as const;
export const GUIDE_CSV_MAX_ROWS = 300;

const PLACE_KEYS: Record<string, keyof RawGuidePlace> = {
  kind: "kind", name: "name", municipality: "municipality", address: "address", latitude: "latitude", longitude: "longitude",
  price_min: "priceMin", price_max: "priceMax", price_unit: "priceUnit", specialties: "specialties", tags: "tags", hours: "hours",
  phone: "phone", description: "description", source: "source", checked_on: "checkedOn", slug: "slug",
};
const FARE_KEYS: Record<string, keyof RawFare> = {
  mode: "mode", from: "fromName", to: "toName", fare_min: "fareMin", fare_max: "fareMax", fare_per: "farePer",
  minutes_min: "minutesMin", minutes_max: "minutesMax", schedule_note: "scheduleNote", source: "source", checked_on: "checkedOn",
};

type Result<T> = { rows: T[]; errors: Array<{ line: number; message: string }> };

function readTable<T>(
  text: string,
  required: string[],
  columns: readonly string[],
  keys: Record<string, string>,
  validate: (raw: Record<string, string>) => { ok: true; data: T } | { ok: false; errors: Record<string, string> },
): Result<T> {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], errors: [{ line: 1, message: "The file needs a header row and at least one row." }] };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const missing = required.filter((col) => !header.includes(col));
  if (missing.length) return { rows: [], errors: [{ line: 1, message: `Missing column(s): ${missing.join(", ")}. Expected: ${columns.join(", ")}.` }] };
  if (table.length - 1 > GUIDE_CSV_MAX_ROWS) return { rows: [], errors: [{ line: 1, message: `Import at most ${GUIDE_CSV_MAX_ROWS} rows at a time.` }] };

  const rows: T[] = [];
  const errors: Result<T>["errors"] = [];
  table.slice(1).forEach((cells, index) => {
    const raw: Record<string, string> = {};
    header.forEach((col, i) => {
      if (keys[col]) raw[keys[col]] = cells[i] ?? "";
    });
    const result = validate(raw);
    if (result.ok) rows.push(result.data);
    else errors.push({ line: index + 2, message: Object.entries(result.errors).map(([f, m]) => `${f}: ${m}`).join(" ") });
  });
  return { rows, errors };
}

/** Validates every row; the import saves nothing unless all rows pass. Slugs must not repeat. */
export function parseGuidePlacesCsv(text: string, today: string): Result<GuidePlaceInput> {
  const result = readTable<GuidePlaceInput>(text, ["kind", "name", "source"], PLACE_CSV_COLUMNS, PLACE_KEYS, (raw) =>
    validateGuidePlace({ ...raw, kind: (raw.kind ?? "").trim().toLowerCase(), isActive: true }, today),
  );
  const seen = new Map<string, number>();
  result.rows.forEach((row, i) => {
    if (seen.has(row.slug)) result.errors.push({ line: i + 2, message: `slug "${row.slug}" repeats an earlier row.` });
    seen.set(row.slug, i);
  });
  return result;
}

export function parseFaresCsv(text: string, today: string): Result<FareInput> {
  return readTable<FareInput>(text, ["mode", "from", "to", "source"], FARE_CSV_COLUMNS, FARE_KEYS, (raw) =>
    validateFare({ ...raw, mode: (raw.mode ?? "").trim().toLowerCase().replace("-", "_"), isActive: true }, today),
  );
}
