import fc from "fast-check";
import { createHmac } from "node:crypto";
import {
  buildSignatureHeader,
  computeSignature,
  parseSignatureHeader,
  verifyWebhookSignature,
} from "@/lib/paymongo/signature";

const SECRET = "whsk_test_secret";
const BODY = '{"data":{"id":"evt_1","attributes":{"type":"checkout_session.payment.paid"}}}';
const NOW = new Date("2026-10-23T10:00:00Z");
const T = Math.floor(NOW.getTime() / 1000);

describe("parseSignatureHeader", () => {
  it("parses t, te and li in any order", () => {
    expect(parseSignatureHeader("li=abc,t=123,te=def")).toEqual({ timestamp: 123, test: "def", live: "abc" });
  });

  it("treats empty signatures as missing", () => {
    expect(parseSignatureHeader("t=123,te=,li=")).toEqual({ timestamp: 123, test: null, live: null });
  });

  it("rejects headers without a numeric timestamp", () => {
    expect(parseSignatureHeader("te=abc")).toBeNull();
    expect(parseSignatureHeader("t=abc,te=x")).toBeNull();
    expect(parseSignatureHeader("")).toBeNull();
  });
});

describe("computeSignature", () => {
  it("is hex HMAC-SHA256 of `${t}.${body}`", () => {
    const expected = createHmac("sha256", SECRET).update(`${T}.${BODY}`).digest("hex");
    expect(computeSignature(SECRET, T, BODY)).toBe(expected);
  });
});

describe("verifyWebhookSignature", () => {
  const valid = buildSignatureHeader(SECRET, T, BODY, "test");

  it("accepts a valid test-mode signature", () => {
    expect(verifyWebhookSignature({ header: valid, rawBody: BODY, secret: SECRET, mode: "test", now: NOW })).toEqual({
      ok: true,
      timestamp: T,
    });
  });

  it("checks li in live mode and te in test mode", () => {
    const live = buildSignatureHeader(SECRET, T, BODY, "live");
    expect(verifyWebhookSignature({ header: live, rawBody: BODY, secret: SECRET, mode: "live", now: NOW }).ok).toBe(true);
    expect(verifyWebhookSignature({ header: live, rawBody: BODY, secret: SECRET, mode: "test", now: NOW })).toEqual({
      ok: false,
      reason: "missing_signature",
    });
  });

  it("rejects a tampered body", () => {
    const tampered = BODY.replace("evt_1", "evt_2");
    expect(verifyWebhookSignature({ header: valid, rawBody: tampered, secret: SECRET, mode: "test", now: NOW })).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });

  it("rejects the wrong secret", () => {
    expect(verifyWebhookSignature({ header: valid, rawBody: BODY, secret: "other", mode: "test", now: NOW }).ok).toBe(false);
  });

  it("rejects re-serialized JSON (must verify the raw bytes)", () => {
    const pretty = JSON.stringify(JSON.parse(BODY), null, 2);
    expect(verifyWebhookSignature({ header: valid, rawBody: pretty, secret: SECRET, mode: "test", now: NOW }).ok).toBe(false);
  });

  it("rejects replays outside the 5-minute window", () => {
    const old = buildSignatureHeader(SECRET, T - 301, BODY, "test");
    expect(verifyWebhookSignature({ header: old, rawBody: BODY, secret: SECRET, mode: "test", now: NOW })).toEqual({
      ok: false,
      reason: "expired",
    });
    const recent = buildSignatureHeader(SECRET, T - 299, BODY, "test");
    expect(verifyWebhookSignature({ header: recent, rawBody: BODY, secret: SECRET, mode: "test", now: NOW }).ok).toBe(true);
  });

  it("rejects missing or malformed headers", () => {
    expect(verifyWebhookSignature({ header: null, rawBody: BODY, secret: SECRET, mode: "test", now: NOW })).toEqual({
      ok: false,
      reason: "missing_header",
    });
    expect(verifyWebhookSignature({ header: "garbage", rawBody: BODY, secret: SECRET, mode: "test", now: NOW })).toEqual({
      ok: false,
      reason: "malformed_header",
    });
  });

  it("never accepts a signature made with a different body (property)", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (bodyA, bodyB) => {
        fc.pre(bodyA !== bodyB);
        const header = buildSignatureHeader(SECRET, T, bodyA, "test");
        return verifyWebhookSignature({ header, rawBody: bodyB, secret: SECRET, mode: "test", now: NOW }).ok === false;
      }),
    );
  });
});
