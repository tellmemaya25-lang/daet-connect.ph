import { FARE_MODES, type Fare, type FareLeg, type FareMode, type FareRoute } from "@/lib/tours/guide/fares";

/**
 * The tourist's fare calculator ("magkano ang pasundo?"): what a group pays to
 * get from where they are to a place in Daet, from the Tourism Office's fare
 * table only. Per-person legs are multiplied by the group; legs paid per trip
 * or per boat are paid once and shared. A leg with no listed fare is named and
 * left out of the total, so the total says "at least". Nothing is made up.
 */

export type QuoteLeg = {
  mode: FareMode;
  modeLabel: string;
  from: string;
  to: string;
  per: Fare["fare_per"];
  min: number | null;
  max: number | null;
  /** What this leg costs the whole group (min–max), or null when no fare is listed. */
  groupMin: number | null;
  groupMax: number | null;
  minutesMin: number | null;
  minutesMax: number | null;
  scheduleNote: string | null;
  source: string;
  checkedOn: string;
};

export type Quote = {
  legs: QuoteLeg[];
  people: number;
  roundTrip: boolean;
  /** Total for the group, both ways when roundTrip. */
  totalMin: number;
  totalMax: number;
  perPersonMin: number;
  perPersonMax: number;
  /** Some leg has no listed fare, or only a lowest price: the total is a floor. */
  partial: boolean;
  /** Legs with no fare, to ask about locally. */
  unknown: string[];
  minutesMin: number | null;
  minutesMax: number | null;
  /** The oldest "checked on" date across the legs. */
  checkedOn: string | null;
};

export const MAX_PEOPLE = 30;

/** 1..30; anything else becomes 1. */
export function parsePeople(value: unknown): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_PEOPLE ? n : 1;
}

function legQuote(leg: FareLeg, people: number): QuoteLeg {
  const lo = leg.fare_min ?? leg.fare_max;
  const hi = leg.fare_max ?? leg.fare_min;
  const times = leg.fare_per === "person" ? people : 1;
  return {
    mode: leg.mode,
    modeLabel: FARE_MODES[leg.mode] ?? leg.mode,
    from: leg.from_name,
    to: leg.to_name,
    per: leg.fare_per,
    min: leg.fare_min,
    max: leg.fare_max,
    groupMin: lo === null ? null : lo * times,
    groupMax: hi === null ? null : hi * times,
    minutesMin: leg.minutes_min,
    minutesMax: leg.minutes_max,
    scheduleNote: leg.schedule_note,
    source: leg.source,
    checkedOn: leg.checked_on,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Prices one route for a group, one way or there and back. */
export function quoteRoute(route: FareRoute, people: number, roundTrip: boolean): Quote {
  const group = Math.min(Math.max(Math.trunc(people) || 1, 1), MAX_PEOPLE);
  const legs = route.legs.map((l) => legQuote(l, group));
  const ways = roundTrip ? 2 : 1;
  const known = legs.filter((l) => l.groupMin !== null);
  const totalMin = round2(known.reduce((s, l) => s + (l.groupMin as number), 0) * ways);
  const totalMax = round2(known.reduce((s, l) => s + (l.groupMax as number), 0) * ways);
  const unknown = legs.filter((l) => l.groupMin === null).map((l) => `${l.modeLabel}: ${l.from} to ${l.to}`);
  const fromOnly = route.legs.some((l) => l.fare_min !== null && l.fare_max === null);
  return {
    legs,
    people: group,
    roundTrip,
    totalMin,
    totalMax,
    perPersonMin: round2(totalMin / group),
    perPersonMax: round2(totalMax / group),
    partial: unknown.length > 0 || fromOnly,
    unknown,
    minutesMin: route.minutesMin,
    minutesMax: route.minutesMax,
    checkedOn: legs.map((l) => l.checkedOn).filter(Boolean).sort()[0] ?? null,
  };
}

/** Every place named in the fare table, A to Z, for the "from" and "to" pickers. */
export function farePlaces(fares: Fare[]): string[] {
  const names = new Set<string>();
  for (const f of fares) {
    if (!f.is_active) continue;
    names.add(f.from_name.trim());
    names.add(f.to_name.trim());
  }
  return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

/** A place picked from the list, or "" (the form only offers listed places). */
export function pickPlace(value: unknown, places: string[]): string {
  const v = typeof value === "string" ? value.trim() : "";
  return places.includes(v) ? v : "";
}
