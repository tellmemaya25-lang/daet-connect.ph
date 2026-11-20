import { hasTicket, hasUsableTicket } from "./ticket";

describe("hasTicket", () => {
  it("needs a confirmed (or completed) booking that is paid in full", () => {
    expect(hasTicket({ status: "confirmed", payment_status: "paid" })).toBe(true);
    expect(hasTicket({ status: "completed", payment_status: "paid" })).toBe(true);
    expect(hasTicket({ status: "confirmed", payment_status: "unpaid" })).toBe(false);
    expect(hasTicket({ status: "confirmed", payment_status: "partial" })).toBe(false);
    expect(hasTicket({ status: "confirmed", payment_status: null })).toBe(false);
    expect(hasTicket({ status: "pending", payment_status: "paid" })).toBe(false);
    expect(hasTicket({ status: "cancelled", payment_status: "paid" })).toBe(false);
    expect(hasTicket({ status: "confirmed", payment_status: "refunded" })).toBe(false);
  });
});

describe("hasUsableTicket", () => {
  const paid = { status: "confirmed", payment_status: "paid" };
  it("is usable up to and including the tour day (Manila date keys)", () => {
    expect(hasUsableTicket({ ...paid, tour_date: "2026-11-21" }, "2026-11-20")).toBe(true);
    expect(hasUsableTicket({ ...paid, tour_date: "2026-11-20" }, "2026-11-20")).toBe(true);
  });
  it("has expired once the tour day has passed, even while still confirmed", () => {
    expect(hasUsableTicket({ ...paid, tour_date: "2026-11-19" }, "2026-11-20")).toBe(false);
  });
  it("is not offered for completed, unpaid or cancelled bookings", () => {
    expect(hasUsableTicket({ status: "completed", payment_status: "paid", tour_date: "2026-11-25" }, "2026-11-20")).toBe(false);
    expect(hasUsableTicket({ status: "confirmed", payment_status: "partial", tour_date: "2026-11-25" }, "2026-11-20")).toBe(false);
    expect(hasUsableTicket({ status: "cancelled", payment_status: "paid", tour_date: "2026-11-25" }, "2026-11-20")).toBe(false);
  });
});
