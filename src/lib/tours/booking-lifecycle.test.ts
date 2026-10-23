import {
  BOOKING_STATUSES,
  checkTransition,
  operatorActions,
  type BookingActor,
  type BookingStatus,
} from "@/lib/tours/booking-lifecycle";

const ctx = { tourDate: "2026-11-07", today: "2026-10-23", totalPaid: 0 };

/** Expected matrix: [from, to, actor] that are allowed (with ctx above, tour in the future, unpaid). */
const ALLOWED = new Set([
  "pending>confirmed>operator", "pending>confirmed>admin",
  "pending>rejected>operator", "pending>rejected>admin",
  "pending>cancelled>operator", "pending>cancelled>admin", "pending>cancelled>tourist",
  "confirmed>cancelled>operator", "confirmed>cancelled>admin",
]);

describe("checkTransition matrix", () => {
  const actors: BookingActor[] = ["operator", "admin", "tourist"];
  for (const from of BOOKING_STATUSES) {
    for (const to of BOOKING_STATUSES) {
      if (from === to) continue;
      for (const actor of actors) {
        const key = `${from}>${to}>${actor}`;
        it(`${key} is ${ALLOWED.has(key) ? "allowed" : "blocked"}`, () => {
          expect(checkTransition(from, to, actor, ctx).ok).toBe(ALLOWED.has(key));
        });
      }
    }
  }

  it("treats no change as allowed", () => {
    for (const status of BOOKING_STATUSES) expect(checkTransition(status, status, "tourist", ctx).ok).toBe(true);
  });
});

describe("context rules", () => {
  it("only completes on or after the tour date", () => {
    expect(checkTransition("confirmed", "completed", "operator", ctx).ok).toBe(false);
    expect(checkTransition("confirmed", "completed", "operator", { ...ctx, today: "2026-11-07" }).ok).toBe(true);
    expect(checkTransition("confirmed", "completed", "admin", { ...ctx, today: "2026-11-30" }).ok).toBe(true);
    expect(checkTransition("confirmed", "completed", "tourist", { ...ctx, today: "2026-11-30" }).ok).toBe(false);
  });

  it("blocks tourists from instantly cancelling a paid pending booking", () => {
    const result = checkTransition("pending", "cancelled", "tourist", { ...ctx, totalPaid: 100 });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain("Request a cancellation");
  });

  it("never reopens a final booking", () => {
    for (const from of ["completed", "cancelled", "rejected"] as BookingStatus[]) {
      for (const to of BOOKING_STATUSES) {
        if (to !== from) expect(checkTransition(from, to, "admin", ctx).ok).toBe(false);
      }
    }
  });
});

describe("operatorActions", () => {
  it("offers confirm/decline/cancel for pending", () => {
    expect(operatorActions("pending", ctx).map((a) => a.to)).toEqual(["confirmed", "rejected", "cancelled"]);
  });

  it("offers complete only once the tour date arrives", () => {
    expect(operatorActions("confirmed", ctx).map((a) => a.to)).toEqual(["cancelled"]);
    expect(operatorActions("confirmed", { ...ctx, today: "2026-11-07" }).map((a) => a.to)).toEqual(["completed", "cancelled"]);
  });

  it("offers nothing for final bookings and asks for reasons on destructive actions", () => {
    expect(operatorActions("completed", ctx)).toEqual([]);
    expect(operatorActions("pending", ctx).filter((a) => a.needsReason).map((a) => a.to)).toEqual(["rejected", "cancelled"]);
  });
});
