/**
 * Our triggers and RPCs raise errors written for people (e.g. "Only 2 seat(s)
 * left on this date."). Raw Postgres errors ("new row violates row-level
 * security policy ...") must not reach the page, so only messages from our
 * own RAISE statements pass through; everything else becomes `fallback`.
 */

type DbError = { code?: string | null; message?: string | null } | null | undefined;

const RAISED_CODES = new Set(["23514", "23505", "42501", "P0001", "P0002"]);
const POSTGRES_WORDING = /^(new row|duplicate key|permission denied|null value|insert or update|update or delete|violates|value too long|invalid input)/i;

export function userFacingDbError(error: DbError, fallback: string): string {
  const message = error?.message?.trim();
  if (!error || !message || !RAISED_CODES.has(String(error.code))) return fallback;
  if (POSTGRES_WORDING.test(message) || / violates /.test(message)) return fallback;
  return message;
}
