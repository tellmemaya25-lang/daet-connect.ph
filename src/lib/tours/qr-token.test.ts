import fc from "fast-check";
import {
  badgeExpiry,
  checkInAllowed,
  extractQrToken,
  signQrToken,
  ticketExpiry,
  verifyQrToken,
  verifyUrl,
} from "@/lib/tours/qr-token";

const SECRET = "test-secret-that-is-at-least-32-characters-long";
const ID = "9b7e5a5e-0000-4000-8000-000000000001";
const now = new Date("2026-10-23T00:00:00Z");
const exp = Math.floor(now.getTime() / 1000) + 3600;

describe("signQrToken / verifyQrToken", () => {
  it("round-trips guide and booking tokens", () => {
    for (const type of ["guide", "booking"] as const) {
      const token = signQrToken({ type, id: ID, exp }, SECRET);
      expect(token).toMatch(/^CD1\.(guide|booking)\.[0-9a-f-]{36}\.\d+\.[A-Za-z0-9_-]{43}$/);
      expect(verifyQrToken(token, SECRET, now)).toEqual({ ok: true, type, id: ID, exp });
    }
  });

  it("rejects a different secret, a changed field, or a forged signature", () => {
    const token = signQrToken({ type: "guide", id: ID, exp }, SECRET);
    expect(verifyQrToken(token, `${SECRET}x`, now)).toEqual({ ok: false, reason: "bad_signature" });
    const [v, , id, e, sig] = token.split(".");
    expect(verifyQrToken([v, "booking", id, e, sig].join("."), SECRET, now).ok).toBe(false);
    expect(verifyQrToken([v, "guide", id, String(exp + 1), sig].join("."), SECRET, now).ok).toBe(false);
    expect(verifyQrToken([v, "guide", id.replace(/1$/, "2"), e, sig].join("."), SECRET, now).ok).toBe(false);
    expect(verifyQrToken([v, "guide", id, e, "A".repeat(43)].join("."), SECRET, now)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("expires at exp", () => {
    const token = signQrToken({ type: "booking", id: ID, exp }, SECRET);
    expect(verifyQrToken(token, SECRET, new Date(exp * 1000 - 1)).ok).toBe(true);
    expect(verifyQrToken(token, SECRET, new Date(exp * 1000))).toEqual({ ok: false, reason: "expired" });
  });

  it.each(["", "CD1", "CD1.guide.x.1.y", "CD2.guide.9b7e5a5e-0000-4000-8000-000000000001.1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "CD1.operator.9b7e5a5e-0000-4000-8000-000000000001.1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "CD1.guide.9B7E5A5E-0000-4000-8000-000000000001.1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"])(
    "rejects malformed token %p",
    (token) => {
      expect(verifyQrToken(token, SECRET, now)).toEqual({ ok: false, reason: "malformed" });
    },
  );

  it("never accepts a mutated token (property)", () => {
    const token = signQrToken({ type: "guide", id: ID, exp }, SECRET);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: token.length - 1 }), fc.string({ minLength: 1, maxLength: 1 }), (index, ch) => {
        fc.pre(token[index] !== ch);
        const mutated = token.slice(0, index) + ch + token.slice(index + 1);
        expect(verifyQrToken(mutated, SECRET, now).ok).toBe(false);
      }),
    );
  });

  it("refuses to sign bad claims", () => {
    expect(() => signQrToken({ type: "guide", id: "nope", exp }, SECRET)).toThrow();
    expect(() => signQrToken({ type: "guide", id: ID, exp: 1.5 }, SECRET)).toThrow();
  });
});

describe("extractQrToken / verifyUrl", () => {
  it("reads raw tokens and verify URLs", () => {
    const token = signQrToken({ type: "guide", id: ID, exp }, SECRET);
    expect(extractQrToken(`  ${token} `)).toBe(token);
    expect(extractQrToken(verifyUrl("https://daet.example/", token))).toBe(token);
    expect(extractQrToken("https://evil.example/other")).toBeNull();
    expect(extractQrToken("CONNECT-DAET-GUIDE:abc")).toBeNull();
  });
});

describe("expiry helpers", () => {
  it("badges last a year; tickets end with the Manila tour day", () => {
    expect(badgeExpiry("2026-01-01T00:00:00Z")).toBe(Date.UTC(2027, 0, 1) / 1000);
    // 2026-11-07 Manila ends at 2026-11-07T16:00:00Z
    expect(ticketExpiry("2026-11-07")).toBe(Date.UTC(2026, 10, 7, 16) / 1000);
  });
});

describe("checkInAllowed", () => {
  it("only confirmed, paid bookings on the tour date", () => {
    expect(checkInAllowed({ status: "confirmed", payment_status: "paid", tour_date: "2026-11-07" }, "2026-11-07")).toEqual({ ok: true });
    expect(checkInAllowed({ status: "confirmed", payment_status: "paid", tour_date: "2026-11-08" }, "2026-11-07")).toEqual({ ok: false, reason: "Check-in opens on the tour date." });
    expect(checkInAllowed({ status: "confirmed", payment_status: "paid", tour_date: "2026-11-06" }, "2026-11-07").ok).toBe(false);
    expect(checkInAllowed({ status: "pending", payment_status: "paid", tour_date: "2026-11-07" }, "2026-11-07")).toEqual({ ok: false, reason: "This booking is not confirmed yet." });
    expect(checkInAllowed({ status: "cancelled", payment_status: "paid", tour_date: "2026-11-07" }, "2026-11-07").ok).toBe(false);
  });
  it("only bookings paid in full", () => {
    expect(checkInAllowed({ status: "confirmed", payment_status: "partial", tour_date: "2026-11-07" }, "2026-11-07")).toEqual({ ok: false, reason: "This booking isn't paid in full yet, so it can't be checked in." });
    expect(checkInAllowed({ status: "confirmed", payment_status: "unpaid", tour_date: "2026-11-07" }, "2026-11-07").ok).toBe(false);
  });
});
