/**
 * Contact numbers on bookings are digits only: a PH mobile is 11 digits
 * (09XXXXXXXXX) and an international one without "+" is up to 13.
 */
export const PHONE_MIN_DIGITS = 10;
export const PHONE_MAX_DIGITS = 13;

/** Keeps only the digits a person typed or pasted, capped at the max length. */
export function digitsOnlyPhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, PHONE_MAX_DIGITS);
}

/** Null when valid, otherwise a message for the person filling the form. */
export function phoneError(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) {
    return "Phone number must contain numbers only (e.g. 09123456789).";
  }
  const length = value.trim().length;
  if (length < PHONE_MIN_DIGITS || length > PHONE_MAX_DIGITS) {
    return `Phone number must be ${PHONE_MIN_DIGITS} to ${PHONE_MAX_DIGITS} digits.`;
  }
  return null;
}
