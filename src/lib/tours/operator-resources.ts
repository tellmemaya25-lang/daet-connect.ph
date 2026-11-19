/**
 * What an operator owns, and what a tour takes from it (20261223).
 *
 * A package's capacity today is one number per date, which cannot express "one
 * boat, two tours". A resource is the missing noun: a boat, a van, a driver or a
 * guide team. A booking claims one on every day it occupies, and the database
 * (tours_claim_resources) refuses the booking when nothing is free.
 *
 * A package that declares no needs keeps exactly the old behaviour, so this is
 * opt-in per tour.
 */

export const RESOURCE_KINDS = ["boat", "van", "car", "tricycle", "driver", "guide_team"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const RESOURCE_KIND_LABELS: Record<ResourceKind, string> = {
  boat: "Boat",
  van: "Van",
  car: "Car",
  tricycle: "Tricycle",
  driver: "Driver",
  guide_team: "Guide team",
};

/** Plural for headings: "Boats", "Vans", "Guide teams". */
export const RESOURCE_KIND_PLURALS: Record<ResourceKind, string> = {
  boat: "Boats",
  van: "Vans",
  car: "Cars",
  tricycle: "Tricycles",
  driver: "Drivers",
  guide_team: "Guide teams",
};

export const isResourceKind = (value: unknown): value is ResourceKind =>
  typeof value === "string" && (RESOURCE_KINDS as readonly string[]).includes(value);

export const MAX_SEATS = 200;
export const MAX_UNITS = 50;
export const MAX_SEATS_PER_PAX = 10;
export const MAX_UNITS_PER_BOOKING = 10;
export const MAX_NAME = 80;

export type Resource = {
  id: string;
  kind: ResourceKind;
  name: string;
  seats: number;
  units: number;
  note: string | null;
  is_active: boolean;
};

export type ResourceNeed = {
  kind: ResourceKind;
  seats_per_pax: number;
  units_per_booking: number;
};

type Draft<T> = { ok: true; value: T } | { ok: false; error: string };

const whole = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isInteger(n) ? n : null;
};

/**
 * Validates one row of the fleet form.
 * `units` is how many of them the operator has; `seats` is what one carries.
 */
export function parseResourceDraft(input: {
  kind: string;
  name: string;
  seats: number;
  units: number;
  note?: string | null;
}): Draft<{ kind: ResourceKind; name: string; seats: number; units: number; note: string | null }> {
  if (!isResourceKind(input.kind)) return { ok: false, error: "Choose what kind of vehicle or crew this is." };

  const name = (input.name ?? "").trim();
  if (name.length < 1) return { ok: false, error: "Give it a name you will recognise, for example “Boat 1”." };
  if (name.length > MAX_NAME) return { ok: false, error: `Keep the name under ${MAX_NAME} characters.` };

  const seats = whole(input.seats);
  if (seats === null || seats < 0 || seats > MAX_SEATS) {
    return { ok: false, error: `Seats must be a whole number from 0 to ${MAX_SEATS}.` };
  }

  const units = whole(input.units);
  if (units === null || units < 1 || units > MAX_UNITS) {
    return { ok: false, error: `How many you have must be a whole number from 1 to ${MAX_UNITS}.` };
  }

  // A boat with no seats carries nobody; a driver carries people by driving.
  if (seats === 0 && input.kind !== "driver") {
    return { ok: false, error: "Put in how many guests one carries. Use 0 only for a driver, who carries none directly." };
  }

  const note = (input.note ?? "").trim();
  return { ok: true, value: { kind: input.kind, name, seats, units, note: note || null } };
}

/**
 * Validates one row of a tour's needs.
 * `seatsPerPax` is how many seats one guest takes; `unitsPerBooking` is how many
 * of the resource the tour takes whatever the group size (one van).
 */
export function parseNeedDraft(input: {
  kind: string;
  seatsPerPax: number;
  unitsPerBooking: number;
}): Draft<{ kind: ResourceKind; seats_per_pax: number; units_per_booking: number }> {
  if (!isResourceKind(input.kind)) return { ok: false, error: "Choose what kind of resource this tour uses." };

  const seatsPerPax = whole(input.seatsPerPax);
  if (seatsPerPax === null || seatsPerPax < 0 || seatsPerPax > MAX_SEATS_PER_PAX) {
    return { ok: false, error: `Seats per guest must be a whole number from 0 to ${MAX_SEATS_PER_PAX}.` };
  }

  const unitsPerBooking = whole(input.unitsPerBooking);
  if (unitsPerBooking === null || unitsPerBooking < 0 || unitsPerBooking > MAX_UNITS_PER_BOOKING) {
    return { ok: false, error: `Units per booking must be a whole number from 0 to ${MAX_UNITS_PER_BOOKING}.` };
  }

  if (seatsPerPax === 0 && unitsPerBooking === 0) {
    return { ok: false, error: "A tour that uses nothing should not list this resource. Remove the row instead." };
  }

  return { ok: true, value: { kind: input.kind, seats_per_pax: seatsPerPax, units_per_booking: unitsPerBooking } };
}

/** How many guests a resource can carry, shown next to its name. */
export function resourceSummary(resource: Pick<Resource, "kind" | "seats" | "units">): string {
  const kind = RESOURCE_KIND_LABELS[resource.kind].toLowerCase();
  const count = resource.units === 1 ? `1 ${kind}` : `${resource.units} ${kind}s`;
  if (resource.seats === 0) return count;
  return `${count} · ${resource.seats} seat${resource.seats === 1 ? "" : "s"} each`;
}

/** What a tour needs, in a sentence: "1 boat seat per guest, 1 van per booking". */
export function needSummary(need: Pick<ResourceNeed, "kind" | "seats_per_pax" | "units_per_booking">): string {
  const parts: string[] = [];
  if (need.seats_per_pax > 0) {
    parts.push(`${need.seats_per_pax} ${RESOURCE_KIND_LABELS[need.kind].toLowerCase()} seat${need.seats_per_pax === 1 ? "" : "s"} per guest`);
  }
  if (need.units_per_booking > 0) {
    parts.push(`${need.units_per_booking} per booking`);
  }
  return parts.join(", ") || "nothing";
}

/** Groups rows by kind, in the canonical order, dropping empty groups. */
export function groupByKind<T extends { kind: ResourceKind }>(rows: readonly T[]): { kind: ResourceKind; rows: T[] }[] {
  return RESOURCE_KINDS.map((kind) => ({ kind, rows: rows.filter((row) => row.kind === kind) })).filter((group) => group.rows.length > 0);
}
