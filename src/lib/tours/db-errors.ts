/**
 * Our triggers and RPCs raise errors written for people (e.g. "Only 2 seat(s)
 * left on this date."). Raw Postgres errors ("new row violates row-level
 * security policy ...") must not reach the page, so only messages from our
 * own RAISE statements pass through; everything else becomes `fallback`.
 */

type DbError = { code?: string | null; message?: string | null } | null | undefined;

const RAISED_CODES = new Set(["22023", "23514", "23505", "42501", "P0001", "P0002"]);
const POSTGRES_WORDING = /^(new row|duplicate key|permission denied|null value|insert or update|update or delete|violates|value too long|invalid input)/i;

/** Unique indexes and checks whose raw Postgres message needs a person's wording. */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  tours_bookings_one_active_per_tourist: "You already have a booking for this tour on this date. Open My bookings to change the number of guests.",
  tours_bookings_one_tour_per_guide_day: "This guide already has a tour on that day. Choose another guide.",
  tours_bookings_contact_phone_digits: "Phone number must contain numbers only (e.g. 09123456789).",
};

export function userFacingDbError(error: DbError, fallback: string): string {
  const message = error?.message?.trim();
  const constraint = message ? Object.keys(CONSTRAINT_MESSAGES).find((name) => message.includes(`"${name}"`)) : undefined;
  if (constraint) return CONSTRAINT_MESSAGES[constraint];
  if (!error || !message || !RAISED_CODES.has(String(error.code))) return fallback;
  if (POSTGRES_WORDING.test(message) || / violates /.test(message)) return fallback;
  return message;
}
