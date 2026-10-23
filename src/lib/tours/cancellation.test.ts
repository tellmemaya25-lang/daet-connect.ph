import { cancellationOption, parseCancellationReason, parseRefundForm, parseStaffReason } from "@/lib/tours/cancellation";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

// Tour on 2026-11-07 starts at 2026-11-06T16:00:00Z (Manila midnight).
const tour = (overrides: Partial<{ status: string; total_paid: number }>) => ({
  status: "pending",
  tour_date: "2026-11-07",
  total_paid: 0,
  ...overrides,
});
const early = new Date("2026-10-23T00:00:00Z");

describe("cancellationOption", () => {
  it("cancels unpaid pending bookings instantly", () => {
    expect(cancellationOption(tour({}), early)).toEqual({ mode: "instant", late: false });
  });

  it("turns paid or confirmed bookings into requests", () => {
    expect(cancellationOption(tour({ total_paid: 500 }), early)).toEqual({ mode: "request", late: false });
    expect(cancellationOption(tour({ status: "confirmed" }), early)).toEqual({ mode: "request", late: false });
  });

  it("flags requests within 48 hours of the tour as late", () => {
    expect(cancellationOption(tour({ status: "confirmed" }), new Date("2026-11-04T16:00:01Z"))).toEqual({ mode: "request", late: true });
    expect(cancellationOption(tour({ status: "confirmed" }), new Date("2026-11-04T15:59:59Z"))).toEqual({ mode: "request", late: false });
  });

  it("refuses once the tour day has started (Manila time) or the booking is final", () => {
    expect(cancellationOption(tour({ status: "confirmed" }), new Date("2026-11-06T16:00:00Z")).mode).toBe("none");
    expect(cancellationOption(tour({ status: "confirmed" }), new Date("2026-11-06T15:59:00Z")).mode).toBe("request");
    for (const status of ["completed", "cancelled", "rejected"]) {
      expect(cancellationOption(tour({ status }), early).mode).toBe("none");
    }
  });
});

describe("parseCancellationReason", () => {
  it("requires a short explanation", () => {
    expect(parseCancellationReason(form({ reason: "  no " })).ok).toBe(false);
    expect(parseCancellationReason(form({ reason: "x".repeat(501) })).ok).toBe(false);
    expect(parseCancellationReason(form({ reason: "Flight was moved" }))).toEqual({ ok: true, reason: "Flight was moved" });
  });
});

describe("parseStaffReason", () => {
  it("requires 5 to 500 characters", () => {
    expect(parseStaffReason(undefined).ok).toBe(false);
    expect(parseStaffReason("  full ").ok).toBe(false);
    expect(parseStaffReason("y".repeat(501)).ok).toBe(false);
    expect(parseStaffReason("  Boat engine repair ")).toEqual({ ok: true, reason: "Boat engine repair" });
  });
});

describe("parseRefundForm", () => {
  it("accepts refunds up to the refundable amount", () => {
    expect(parseRefundForm(form({ amount: "500", method: "gcash", reference: "R-1" }), 500)).toEqual({
      ok: true,
      data: { amount: 500, method: "gcash", reference: "R-1" },
    });
    expect(parseRefundForm(form({ amount: "250.50", method: "cash" }), 500)).toEqual({
      ok: true,
      data: { amount: 250.5, method: "cash", reference: null },
    });
  });

  it("rejects over-refunds, bad amounts and unknown methods", () => {
    expect(parseRefundForm(form({ amount: "500.01", method: "gcash" }), 500).ok).toBe(false);
    expect(parseRefundForm(form({ amount: "0", method: "gcash" }), 500).ok).toBe(false);
    expect(parseRefundForm(form({ amount: "abc", method: "gcash" }), 500).ok).toBe(false);
    expect(parseRefundForm(form({ amount: "10", method: "crypto" }), 500).ok).toBe(false);
  });
});
