"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseRefundForm, parseStaffReason } from "@/lib/tours/cancellation";
import { userFacingDbError } from "@/lib/tours/db-errors";
import { isUuid } from "@/lib/tours/operator-access";

export type CancellationActionResult = { success: boolean; message?: string; error?: string };

function revalidateBooking(bookingId: string | null) {
  revalidatePath("/tours/operator/bookings");
  revalidatePath("/tours/operator/payments");
  if (bookingId) revalidatePath(`/tours/bookings/${bookingId}`);
}

/**
 * Approve or decline a tourist's cancellation request. The RPC checks that
 * the caller is the booking's approved operator (or an admin), cancels the
 * booking on approval and releases its seats.
 */
export async function resolveCancellationRequest(formData: FormData): Promise<CancellationActionResult> {
  const cancellationId = formData.get("cancellationId");
  const bookingId = formData.get("bookingId");
  const decision = formData.get("decision");
  if (typeof cancellationId !== "string" || !isUuid(cancellationId)) return { success: false, error: "Request not found." };
  if (decision !== "approve" && decision !== "decline") return { success: false, error: "Choose approve or decline." };

  let notes = String(formData.get("notes") ?? "").trim();
  if (decision === "decline") {
    const parsed = parseStaffReason(notes);
    if (!parsed.ok) return { success: false, error: parsed.error };
    notes = parsed.reason;
  } else if (notes.length > 500) {
    return { success: false, error: "Note must be 500 characters or fewer." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("tours_resolve_cancellation", {
    p_cancellation_id: cancellationId,
    p_approve: decision === "approve",
    p_notes: notes,
  });
  if (error) {
    console.error("Resolve cancellation error:", error);
    return { success: false, error: userFacingDbError(error, "The request could not be updated. Please try again.") };
  }

  revalidateBooking(typeof bookingId === "string" && isUuid(bookingId) ? bookingId : null);
  const message =
    data === "rejected"
      ? "Cancellation declined. The booking stays active."
      : data === "approved_refund_due"
        ? "Booking cancelled. Record the refund once you have sent it."
        : "Booking cancelled and its seats released.";
  return { success: true, message };
}

/** Record money returned to the tourist (a 'refunded' ledger row). */
export async function recordRefund(formData: FormData): Promise<CancellationActionResult> {
  const bookingId = formData.get("bookingId");
  if (typeof bookingId !== "string" || !isUuid(bookingId)) return { success: false, error: "Booking not found." };

  const supabase = await createSupabaseServerClient();
  const { data: refundable, error: refundableError } = await supabase.rpc("tours_refundable_amount", { p_booking_id: bookingId });
  if (refundableError) return { success: false, error: "The refundable amount could not be checked." };

  const parsed = parseRefundForm(formData, Number(refundable ?? 0));
  if (!parsed.ok) return { success: false, error: parsed.error };

  const { data: remaining, error } = await supabase.rpc("tours_record_refund", {
    p_booking_id: bookingId,
    p_amount: parsed.data.amount,
    p_method: parsed.data.method,
    p_reference: parsed.data.reference ?? "",
  });
  if (error) {
    console.error("Record refund error:", error);
    return { success: false, error: userFacingDbError(error, "The refund could not be recorded. Please try again.") };
  }

  revalidateBooking(bookingId);
  const left = Number(remaining ?? 0);
  return {
    success: true,
    message: left > 0 ? `Refund recorded. ₱${left.toFixed(2)} can still be refunded.` : "Refund recorded. Everything paid has been returned.",
  };
}
