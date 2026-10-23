import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * PayMongo webhook signatures.
 *
 * Header: `Paymongo-Signature: t=<unix seconds>,te=<test sig>,li=<live sig>`.
 * Signature = hex(HMAC-SHA256(webhookSecret, `${t}.${rawBody}`)). Compare with
 * `te` for test-mode events and `li` for live-mode events. Always verify
 * against the raw request body, never re-serialized JSON.
 */

export type SignatureMode = "test" | "live";

export type SignatureHeader = { timestamp: number; test: string | null; live: string | null };

export type VerifyResult =
  | { ok: true; timestamp: number }
  | { ok: false; reason: "missing_header" | "malformed_header" | "missing_signature" | "mismatch" | "expired" };

/** Default replay window. PayMongo's timestamp check is optional; we enforce 5 minutes. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function parseSignatureHeader(header: string | null | undefined): SignatureHeader | null {
  if (!header) return null;
  const parts = new Map<string, string>();
  for (const piece of header.split(",")) {
    const index = piece.indexOf("=");
    if (index <= 0) continue;
    parts.set(piece.slice(0, index).trim(), piece.slice(index + 1).trim());
  }
  const t = parts.get("t");
  if (!t || !/^\d+$/.test(t)) return null;
  return { timestamp: Number(t), test: parts.get("te") || null, live: parts.get("li") || null };
}

export function computeSignature(secret: string, timestamp: number, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyWebhookSignature({
  header,
  rawBody,
  secret,
  mode,
  now = new Date(),
  toleranceSeconds = SIGNATURE_TOLERANCE_SECONDS,
}: {
  header: string | null | undefined;
  rawBody: string;
  secret: string;
  mode: SignatureMode;
  now?: Date;
  toleranceSeconds?: number;
}): VerifyResult {
  if (!header) return { ok: false, reason: "missing_header" };
  const parsed = parseSignatureHeader(header);
  if (!parsed) return { ok: false, reason: "malformed_header" };

  const provided = mode === "live" ? parsed.live : parsed.test;
  if (!provided) return { ok: false, reason: "missing_signature" };

  const expected = computeSignature(secret, parsed.timestamp, rawBody);
  if (!safeEqualHex(expected, provided.toLowerCase())) return { ok: false, reason: "mismatch" };

  const ageSeconds = Math.abs(Math.floor(now.getTime() / 1000) - parsed.timestamp);
  if (ageSeconds > toleranceSeconds) return { ok: false, reason: "expired" };

  return { ok: true, timestamp: parsed.timestamp };
}

/** Builds a header the way PayMongo does; used by tests and local webhook simulation. */
export function buildSignatureHeader(secret: string, timestamp: number, rawBody: string, mode: SignatureMode): string {
  const signature = computeSignature(secret, timestamp, rawBody);
  return mode === "live" ? `t=${timestamp},te=,li=${signature}` : `t=${timestamp},te=${signature},li=`;
}
