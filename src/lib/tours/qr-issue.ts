import "server-only";
import { resolveAppUrl } from "@/lib/app-url";
import { createQrPngDataUrl } from "@/lib/tours/guide-qr";
import { badgeExpiry, getQrSecret, signQrToken, ticketExpiry, verifyUrl } from "@/lib/tours/qr-token";

/** Public base URL that QR codes link to (phone cameras open it). */
export function appBaseUrl(): string {
  return resolveAppUrl();
}

export type IssuedQr = { token: string; url: string; exp: number; pngDataUrl: string };

async function issue(type: "guide" | "booking", id: string, exp: number): Promise<IssuedQr | null> {
  const secret = getQrSecret();
  if (!secret) return null;
  const token = signQrToken({ type, id, exp }, secret);
  const url = verifyUrl(appBaseUrl(), token);
  return { token, url, exp, pngDataUrl: await createQrPngDataUrl(url) };
}

/** Guide badge, valid for a year from approval. Null when QR_SIGNING_SECRET is not set. */
export function issueGuideBadge(guideId: string, approvedAt: string): Promise<IssuedQr | null> {
  return issue("guide", guideId, badgeExpiry(approvedAt));
}

/** Booking ticket, valid until the end of the tour day. */
export function issueBookingTicket(bookingId: string, tourDate: string): Promise<IssuedQr | null> {
  return issue("booking", bookingId, ticketExpiry(tourDate));
}
