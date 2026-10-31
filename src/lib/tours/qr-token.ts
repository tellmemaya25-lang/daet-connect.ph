import { createHmac, timingSafeEqual } from "node:crypto";
import { manilaDayStartUtc } from "@/lib/tours/events-calendar";

/**
 * Signed QR tokens: `CD1.<type>.<id>.<exp>.<sig>`
 *   sig = base64url(HMAC-SHA256(QR_SIGNING_SECRET, "CD1|type|id|exp")), exp in unix seconds.
 *
 * A token proves the platform issued it and when it stops being valid; it
 * never carries personal data. Pages still read the current database state
 * (accreditation, booking status), so revoking access takes effect at once.
 * Server-only: needs QR_SIGNING_SECRET.
 */

export const QR_VERSION = "CD1";
export const QR_TYPES = ["guide", "booking"] as const;
export type QrType = (typeof QR_TYPES)[number];

export const BADGE_VALID_DAYS = 365;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIN_SECRET_LENGTH = 32;

export type QrClaims = { type: QrType; id: string; exp: number };
export type QrVerifyResult =
  | ({ ok: true } & QrClaims)
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function getQrSecret(): string | null {
  const secret = process.env.QR_SIGNING_SECRET;
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signQrToken({ type, id, exp }: QrClaims, secret: string): string {
  if (!QR_TYPES.includes(type) || !UUID.test(id) || !Number.isInteger(exp) || exp <= 0) {
    throw new Error("Invalid QR claims");
  }
  const lowerId = id.toLowerCase();
  return `${QR_VERSION}.${type}.${lowerId}.${exp}.${sign(`${QR_VERSION}|${type}|${lowerId}|${exp}`, secret)}`;
}

export function verifyQrToken(token: string, secret: string, now: Date = new Date()): QrVerifyResult {
  const parts = token.trim().split(".");
  if (parts.length !== 5) return { ok: false, reason: "malformed" };
  const [version, type, id, expText, sig] = parts;
  if (version !== QR_VERSION || !(QR_TYPES as readonly string[]).includes(type) || !UUID.test(id) || id !== id.toLowerCase()) {
    return { ok: false, reason: "malformed" };
  }
  if (!/^\d{1,12}$/.test(expText) || !/^[A-Za-z0-9_-]{43}$/.test(sig)) return { ok: false, reason: "malformed" };

  const expected = Buffer.from(sign(`${version}|${type}|${id}|${expText}`, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "bad_signature" };

  const exp = Number(expText);
  if (now.getTime() >= exp * 1000) return { ok: false, reason: "expired" };
  return { ok: true, type: type as QrType, id, exp };
}

/** Accepts a raw token or a verify URL (what phone cameras and the scanner read). */
export function extractQrToken(scanned: string): string | null {
  const text = scanned.trim();
  if (text.startsWith(`${QR_VERSION}.`)) return text;
  try {
    const url = new URL(text);
    const match = /\/tours\/verify\/([^/?#]+)\/?$/.exec(url.pathname);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export function verifyUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, "")}/tours/verify/${token}`;
}

/** Guide badges are valid for a year from approval. */
export function badgeExpiry(approvedAt: string | Date): number {
  const start = new Date(approvedAt).getTime();
  return Math.floor(start / 1000) + BADGE_VALID_DAYS * 86400;
}

/** Booking tickets stop working at the end of the tour day (Manila). */
export function ticketExpiry(tourDate: string): number {
  return Math.floor(manilaDayStartUtc(tourDate).getTime() / 1000) + 86400;
}

export type CheckInBooking = { status: string; tour_date: string; payment_status: string | null };
export type CheckInCheck = { ok: true } | { ok: false; reason: string };

/** Same rules as the tours_check_in database function. */
export function checkInAllowed(booking: CheckInBooking, today: string): CheckInCheck {
  if (booking.status !== "confirmed") {
    return { ok: false, reason: booking.status === "pending" ? "This booking is not confirmed yet." : `This booking is ${booking.status}.` };
  }
  if (booking.payment_status !== "paid") {
    return { ok: false, reason: "This booking isn't paid in full yet, so it can't be checked in." };
  }
  if (booking.tour_date !== today) {
    return { ok: false, reason: booking.tour_date > today ? "Check-in opens on the tour date." : "This tour date has passed." };
  }
  return { ok: true };
}
