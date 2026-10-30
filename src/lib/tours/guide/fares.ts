import { normalizeText } from "@/lib/tours/itinerary/assistant";

/** Fares and travel times between places (tours_fares), curated by the Tourism Office. */

export const FARE_MODES = {
  bus: "Bus",
  van: "Van (UV Express)",
  jeepney: "Jeepney",
  tricycle: "Tricycle",
  boat: "Boat",
  habal_habal: "Habal-habal",
  taxi: "Taxi",
  plane: "Plane",
} as const;
export type FareMode = keyof typeof FARE_MODES;
export const FARE_PER = { person: "per person", trip: "per trip", boat: "per boat" } as const;
export type FarePer = keyof typeof FARE_PER;

export function isFareMode(value: unknown): value is FareMode {
  return typeof value === "string" && value in FARE_MODES;
}

export type Fare = {
  id: string;
  mode: FareMode;
  from_name: string;
  to_name: string;
  board_place_id: string | null;
  fare_min: number | null;
  fare_max: number | null;
  fare_per: FarePer;
  minutes_min: number | null;
  minutes_max: number | null;
  schedule_note: string | null;
  source: string;
  checked_on: string;
  verified: boolean;
  is_active: boolean;
};

export const FARE_COLUMNS =
  "id,mode,from_name,to_name,board_place_id,fare_min,fare_max,fare_per,minutes_min,minutes_max,schedule_note,source,checked_on,verified,is_active";

const num = (value: unknown) => (value === null || value === undefined || value === "" ? null : Number(value));

export function toFare(row: Record<string, unknown>): Fare {
  return {
    ...(row as unknown as Fare),
    fare_min: num(row.fare_min),
    fare_max: num(row.fare_max),
    minutes_min: num(row.minutes_min),
    minutes_max: num(row.minutes_max),
  };
}

const words = (value: string) =>
  normalizeText(value)
    .replace(/[()[\]:.,;!?/-]/g, " ")
    .replace(/\b(port|town|center|centre|city|terminal|the|sa|ng)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Does what the traveller typed name this place? "manila" matches "Manila (PITX)"; "daet town" matches "Daet town center". */
export function namesMatch(query: string, name: string): boolean {
  const q = words(query);
  const n = words(name);
  if (!q || !n) return false;
  return ` ${n} `.includes(` ${q} `) || ` ${q} `.includes(` ${n} `);
}

export type FareLeg = Fare & { reversed: boolean };
export type FareRoute = { legs: FareLeg[]; minutesMin: number | null; minutesMax: number | null };

const sumOrNull = (values: Array<number | null>) => (values.some((v) => v === null) ? null : values.reduce<number>((a, b) => a + (b as number), 0));

function routeOf(legs: FareLeg[]): FareRoute {
  return { legs, minutesMin: sumOrNull(legs.map((l) => l.minutes_min)), minutesMax: sumOrNull(legs.map((l) => l.minutes_max)) };
}

/**
 * Ways to get from one place to another: direct fares first (either
 * direction; a ride back costs the same), then two-leg trips through a
 * shared stop such as Daet (Manila → Daet → Bagasbas).
 */
export function faresBetween(fares: Fare[], from: string | null, to: string): FareRoute[] {
  const active = fares.filter((f) => f.is_active);
  const legsFrom = (place: string) => [
    ...active.filter((f) => namesMatch(place, f.from_name)).map((f) => ({ ...f, reversed: false })),
    ...active.filter((f) => namesMatch(place, f.to_name)).map((f) => ({ ...f, from_name: f.to_name, to_name: f.from_name, reversed: true })),
  ];

  if (!from) {
    // "How do I get to Calaguas?": every direct way in, by starting point.
    return active.filter((f) => namesMatch(to, f.to_name)).map((f) => routeOf([{ ...f, reversed: false }]));
  }

  const first = legsFrom(from);
  const direct = first.filter((leg) => namesMatch(to, leg.to_name)).map((leg) => routeOf([leg]));
  if (direct.length) return direct;

  const twoLeg: FareRoute[] = [];
  for (const a of first) {
    for (const b of legsFrom(a.to_name)) {
      if (b.id !== a.id && namesMatch(to, b.to_name)) twoLeg.push(routeOf([a, b]));
    }
  }
  return twoLeg.slice(0, 6);
}

export function fareLabel(fare: Pick<Fare, "fare_min" | "fare_max" | "fare_per">, format: (n: number) => string): string | null {
  const { fare_min: lo, fare_max: hi } = fare;
  if (lo === null && hi === null) return null;
  const per = ` ${FARE_PER[fare.fare_per]}`;
  if (lo !== null && hi !== null && lo !== hi) return `${format(lo)}–${format(hi)}${per}`;
  return `${format((lo ?? hi) as number)}${per}`;
}

export function minutesLabel(min: number | null, max: number | null): string | null {
  const fmt = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);
  if (min === null && max === null) return null;
  if (min !== null && max !== null && min !== max) {
    if (min >= 60 && max >= 60 && min % 60 === 0 && max % 60 === 0) return `${min / 60}–${max / 60} h`;
    return `${fmt(min)} to ${fmt(max)}`;
  }
  return fmt((min ?? max) as number);
}

// ---- admin form and CSV import ----

export type FareInput = Omit<Fare, "id" | "board_place_id">;
export type RawFare = Partial<Record<"mode" | "fromName" | "toName" | "fareMin" | "fareMax" | "farePer" | "minutesMin" | "minutesMax" | "scheduleNote" | "source" | "checkedOn", string>> & {
  verified?: boolean;
  isActive?: boolean;
};

export function validateFare(raw: RawFare, today: string): { ok: true; data: FareInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const text = (value: string | undefined) => (value ?? "").trim();
  const mode = text(raw.mode);
  if (!isFareMode(mode)) errors.mode = "Choose how people travel.";
  const fromName = text(raw.fromName);
  const toName = text(raw.toName);
  if (fromName.length < 2 || fromName.length > 80) errors.fromName = "Enter where the ride starts (2 to 80 characters).";
  if (toName.length < 2 || toName.length > 80) errors.toName = "Enter where it ends (2 to 80 characters).";

  const amount = (value: string | undefined, field: string) => {
    const v = text(value).replace(/^₱/, "").replace(/,/g, "");
    if (!v) return null;
    if (!/^\d+(\.\d{1,2})?$/.test(v)) {
      errors[field] = "Enter pesos, e.g. 30.";
      return null;
    }
    return Number(v);
  };
  const minutes = (value: string | undefined, field: string) => {
    const v = text(value);
    if (!v) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 2000) {
      errors[field] = "Enter whole minutes, e.g. 45.";
      return null;
    }
    return n;
  };
  const fareMin = amount(raw.fareMin, "fareMin");
  const fareMax = amount(raw.fareMax, "fareMax") ?? fareMin;
  if (fareMin !== null && fareMax !== null && fareMin > fareMax) errors.fareMax = "The highest fare must not be below the lowest.";
  const farePer = text(raw.farePer) || "person";
  if (!(farePer in FARE_PER)) errors.farePer = "Choose per person, per trip or per boat.";
  const minutesMin = minutes(raw.minutesMin, "minutesMin");
  const minutesMax = minutes(raw.minutesMax, "minutesMax") ?? minutesMin;
  if (minutesMin !== null && minutesMax !== null && minutesMin > minutesMax) errors.minutesMax = "The longest time must not be below the shortest.";
  const scheduleNote = text(raw.scheduleNote) || null;
  if (scheduleNote && scheduleNote.length > 300) errors.scheduleNote = "Keep this under 300 characters.";
  const source = text(raw.source);
  if (source.length < 3 || source.length > 500) errors.source = "Say where this information comes from.";
  const checkedOn = text(raw.checkedOn) || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkedOn)) errors.checkedOn = "Use a date like 2026-10-29.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      mode: mode as FareMode,
      from_name: fromName,
      to_name: toName,
      fare_min: fareMin,
      fare_max: fareMax,
      fare_per: farePer as FarePer,
      minutes_min: minutesMin,
      minutes_max: minutesMax,
      schedule_note: scheduleNote,
      source,
      checked_on: checkedOn,
      verified: Boolean(raw.verified),
      is_active: raw.isActive ?? true,
    },
  };
}
