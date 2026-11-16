/**
 * Contact numbers are digits only and exactly 11 long: a PH mobile number
 * (09XXXXXXXXX). One rule for every role — traveler bookings, guide and
 * operator registration.
 */
export const PHONE_DIGITS = 11;
export const PHONE_MIN_DIGITS = PHONE_DIGITS;
export const PHONE_MAX_DIGITS = PHONE_DIGITS;
export const PHONE_HINT = "Numbers only, 11 digits (e.g. 09123456789).";

/** Keeps only the digits a person typed or pasted, capped at the max length. */
export function digitsOnlyPhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, PHONE_DIGITS);
}

/** Null when valid, otherwise a message for the person filling the form. */
export function phoneError(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) {
    return "Contact number must contain numbers only (e.g. 09123456789).";
  }
  if (value.trim().length !== PHONE_DIGITS) {
    return `Contact number must be exactly ${PHONE_DIGITS} digits.`;
  }
  return null;
}
