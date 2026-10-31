import type { AddonUnit } from "@/lib/tours/quote";

/** What the operator's Trip details form sends; strings as typed. */
export type TripDetailsInput = {
  itinerary: Array<{ day_number: string | number; start_time: string; activity: string }>;
  thingsToBring: string;
  goodToKnow: string;
  addons: Array<{ name: string; price: string; unit: string; max_guests: string; needs_reservation: boolean; bookable: boolean; note: string }>;
  depositPerPax: string;
  depositRefundable: boolean;
  cancellationPolicy: string;
  variantRules: Array<{ variant_id: string; child_max_age: string; child_price_percent: string; group_min_pax: string; group_discount_per_pax: string; group_free_pax: string }>;
};

/** The payload for tours_save_package_details. */
export type TripDetailsPayload = Record<string, unknown>;

const UNITS: AddonUnit[] = ["per_booking", "per_person", "per_night", "per_hour", "per_item"];
const trimmed = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const intOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
const isWhole = (n: number | null, min: number, max: number) => n === null || (Number.isInteger(n) && n >= min && n <= max);
const isMoney = (v: string) => /^\d{1,7}(\.\d{1,2})?$/.test(v.trim());

/**
 * Checks the form and builds the payload. `full` is false for published
 * packages: only the itinerary, things to bring and notes are sent, the same
 * split the database function enforces.
 */
export function parseTripDetails(input: TripDetailsInput, full: boolean): { ok: true; payload: TripDetailsPayload } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  const itinerary = input.itinerary
    .map((row) => ({ day_number: Number(row.day_number), start_time: trimmed(row.start_time), activity: trimmed(row.activity) }))
    .filter((row) => row.activity || row.start_time);
  itinerary.forEach((row, i) => {
    if (!isWhole(row.day_number, 1, 14)) errors[`itinerary.${i}`] = "Choose a day from 1 to 14.";
    else if (!row.activity) errors[`itinerary.${i}`] = "Say what happens at this time.";
    else if (row.activity.length > 300) errors[`itinerary.${i}`] = "Keep each step under 300 characters.";
    else if (row.start_time.length > 20) errors[`itinerary.${i}`] = "Keep the time short, e.g. 6:30 AM.";
  });
  if (itinerary.length > 80) errors.itinerary = "Up to 80 steps.";

  const things = input.thingsToBring.split("\n").map((t) => t.trim()).filter(Boolean);
  if (things.length > 30) errors.thingsToBring = "Up to 30 items.";
  if (things.some((t) => t.length > 120)) errors.thingsToBring = "Keep each item under 120 characters.";
  const goodToKnow = input.goodToKnow.trim();
  if (goodToKnow.length > 2000) errors.goodToKnow = "Keep this under 2,000 characters.";

  const payload: TripDetailsPayload = {
    itinerary: itinerary.map((row) => ({ day_number: row.day_number, start_time: row.start_time || null, activity: row.activity })),
    things_to_bring: things,
    good_to_know: goodToKnow,
  };

  if (full) {
    const addons = input.addons.filter((a) => trimmed(a.name) || trimmed(a.price));
    addons.forEach((a, i) => {
      if (!trimmed(a.name)) errors[`addons.${i}`] = "Name the extra.";
      else if (trimmed(a.name).length > 120) errors[`addons.${i}`] = "Keep the name under 120 characters.";
      else if (!isMoney(a.price)) errors[`addons.${i}`] = "Enter the price in pesos, e.g. 3500.";
      else if (!UNITS.includes(a.unit as AddonUnit)) errors[`addons.${i}`] = "Choose how it's charged.";
      else if (!isWhole(intOrNull(a.max_guests), 1, 100)) errors[`addons.${i}`] = "Guests must be a whole number from 1 to 100.";
      else if (trimmed(a.note).length > 300) errors[`addons.${i}`] = "Keep the note under 300 characters.";
    });
    if (addons.length > 30) errors.addons = "Up to 30 extras.";
    payload.addons = addons.map((a) => ({
      name: trimmed(a.name),
      price: Number(a.price),
      unit: a.unit,
      max_guests: intOrNull(a.max_guests),
      needs_reservation: a.needs_reservation,
      bookable: a.bookable,
      note: trimmed(a.note) || null,
    }));

    const deposit = input.depositPerPax.trim();
    if (deposit && (!isMoney(deposit) || Number(deposit) <= 0)) errors.depositPerPax = "Enter the fee per person in pesos, or leave it empty.";
    payload.deposit_per_pax = deposit ? Number(deposit) : null;
    payload.deposit_refundable = input.depositRefundable;
    const policy = input.cancellationPolicy.trim();
    if (policy.length > 1000) errors.cancellationPolicy = "Keep this under 1,000 characters.";
    payload.cancellation_policy = policy;

    payload.variant_rules = input.variantRules.map((r, i) => {
      const childAge = intOrNull(r.child_max_age);
      const childPct = intOrNull(r.child_price_percent);
      const groupMin = intOrNull(r.group_min_pax);
      const discount = r.group_discount_per_pax.trim() === "" ? null : Number(r.group_discount_per_pax);
      const free = intOrNull(r.group_free_pax);
      if ((childAge === null) !== (childPct === null)) errors[`rules.${i}`] = "Give both the child age and the child price, or neither.";
      else if (!isWhole(childAge, 0, 17) || !isWhole(childPct, 0, 100)) errors[`rules.${i}`] = "Child age is 0 to 17 and the child price 0 to 100%.";
      else if ((discount !== null || free !== null) && groupMin === null) errors[`rules.${i}`] = "Say from how many guests the group deal starts.";
      else if (groupMin !== null && (!isWhole(groupMin, 2, 500) || (discount !== null && (!Number.isFinite(discount) || discount < 0)) || !isWhole(free, 0, groupMin - 1))) errors[`rules.${i}`] = "Check the group deal: from 2 guests, a discount of ₱0 or more, and fewer free guests than the group size.";
      else if (groupMin !== null && !discount && !free) errors[`rules.${i}`] = "A group deal needs money off per person, free guests, or both.";
      return { variant_id: r.variant_id, child_max_age: childAge, child_price_percent: childPct, group_min_pax: groupMin, group_discount_per_pax: groupMin === null ? null : discount, group_free_pax: groupMin === null ? null : free };
    });
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, payload };
}
