import { hasTicket } from "./ticket";

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
