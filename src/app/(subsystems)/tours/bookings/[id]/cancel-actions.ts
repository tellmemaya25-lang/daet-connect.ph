"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseCancellationReason } from "@/lib/tours/cancellation";
import { userFacingDbError } from "@/lib/tours/db-errors";
import { isUuid } from "@/lib/tours/operator-access";

export type CancelBookingState = { error: string | null; message: string | null };

/**
 * Tourist cancels their booking. The RPC decides: an unpaid pending booking
 * is cancelled at once (seats released); anything else becomes a request the
 * operator approves or declines.
 */
export async function cancelMyBooking(_prev: CancelBookingState, formData: FormData): Promise<CancelBookingState> {
  const bookingId = formData.get("bookingId");
  if (typeof bookingId !== "string" || !isUuid(bookingId)) return { error: "Booking not found.", message: null };

  const parsed = parseCancellationReason(formData);
  if (!parsed.ok) return { error: parsed.error, message: null };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("tours_request_cancellation", { p_booking_id: bookingId, p_reason: parsed.reason });
  if (error) {
    console.error("Cancel booking error:", error);
    return { error: userFacingDbError(error, "Your booking could not be cancelled. Please try again."), message: null };
  }

  revalidatePath(`/tours/bookings/${bookingId}`);
  revalidatePath("/tours/my-bookings");
  revalidatePath("/tours/operator/bookings");
  return {
    error: null,
    message:
      data === "cancelled"
        ? "Your booking is cancelled."
        : "Cancellation requested. The operator will review it and arrange any refund.",
  };
}
