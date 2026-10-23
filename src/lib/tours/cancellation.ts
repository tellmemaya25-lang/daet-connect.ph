import { manilaDayStartUtc } from "@/lib/tours/events-calendar";

/**
 * Tourist cancellation rules (the database RPC tours_request_cancellation
 * applies the same rules):
 * - pending and unpaid → cancelled immediately;
 * - pending with a payment, or confirmed → a request the operator reviews;
 * - on or after the tour date, or already final → not possible.
 * Requests within FREE_CANCELLATION_HOURS of the tour are flagged "late" so
 * the operator can apply their refund policy.
 */

export const FREE_CANCELLATION_HOURS = 48;

export type CancellationBooking = {
  status: string;
  tour_date: string;
  total_paid: number | string | null;
};

export type CancellationOption =
  | { mode: "instant"; late: boolean }
  | { mode: "request"; late: boolean }
  | { mode: "none"; reason: string };

export function cancellationOption(booking: CancellationBooking, now: Date = new Date()): CancellationOption {
  const tourStart = manilaDayStartUtc(booking.tour_date);
  if (now.getTime() >= tourStart.getTime()) {
    return { mode: "none", reason: "The tour date has started, so the booking can no longer be cancelled here. Contact the operator." };
  }
  const late = tourStart.getTime() - now.getTime() < FREE_CANCELLATION_HOURS * 3600 * 1000;
  const paid = Number(booking.total_paid ?? 0) > 0;

  if (booking.status === "pending") return paid ? { mode: "request", late } : { mode: "instant", late };
  if (booking.status === "confirmed") return { mode: "request", late };
  return { mode: "none", reason: "This booking can no longer be cancelled." };
}

export function parseCancellationReason(formData: FormData): { ok: true; reason: string } | { ok: false; error: string } {
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 5) return { ok: false, error: "Tell the operator why you are cancelling (at least 5 characters)." };
  if (reason.length > 500) return { ok: false, error: "Reason must be 500 characters or fewer." };
  return { ok: true, reason };
}

/** Reason an operator gives when declining/cancelling a booking or declining a request; the tourist sees it. */
export function parseStaffReason(value: unknown): { ok: true; reason: string } | { ok: false; error: string } {
  const reason = String(value ?? "").trim();
  if (reason.length < 5) return { ok: false, error: "Tell the tourist why (at least 5 characters)." };
  if (reason.length > 500) return { ok: false, error: "Reason must be 500 characters or fewer." };
  return { ok: true, reason };
}

export type RefundInput = { amount: number; method: "gcash" | "bank_transfer" | "cash" | "other"; reference: string | null };

export function parseRefundForm(formData: FormData, refundable: number): { ok: true; data: RefundInput } | { ok: false; error: string } {
  const amountText = String(formData.get("amount") ?? "").trim();
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(amountText) || Number(amountText) <= 0) {
    return { ok: false, error: "Enter the refunded amount, e.g. 1500 or 1500.50." };
  }
  const amount = Number(amountText);
  if (amount > refundable + 0.001) {
    return { ok: false, error: `You can refund at most ₱${refundable.toFixed(2)} (what was paid, minus earlier refunds).` };
  }
  const method = String(formData.get("method") ?? "");
  if (!["gcash", "bank_transfer", "cash", "other"].includes(method)) return { ok: false, error: "Choose how you refunded." };
  const reference = String(formData.get("reference") ?? "").trim();
  if (reference.length > 60) return { ok: false, error: "Reference is too long." };
  return { ok: true, data: { amount, method: method as RefundInput["method"], reference: reference || null } };
}
