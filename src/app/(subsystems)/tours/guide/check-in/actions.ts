"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { userFacingDbError } from "@/lib/tours/db-errors";
import { isUuid } from "@/lib/tours/operator-access";
import { extractQrToken, getQrSecret, verifyQrToken } from "@/lib/tours/qr-token";

export type CheckInResult = {
  success: boolean;
  /** "checked_in" for a new check-in, "already" when it was done before. */
  outcome?: "checked_in" | "already";
  bookingId?: string;
  message?: string;
  error?: string;
};

async function checkIn(bookingId: string, participantId: string | null, method: "qr" | "manual"): Promise<CheckInResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Please sign in again." };

  const { data, error } = await supabase.rpc("tours_check_in", {
    p_booking_id: bookingId,
    p_participant_id: participantId as string,
    p_method: method,
  });
  if (error) {
    console.error("Check-in error:", error);
    return { success: false, bookingId, error: userFacingDbError(error, "Check-in failed. Please try again.") };
  }

  revalidatePath(`/tours/guide/tours/${bookingId}/roster`);
  revalidatePath("/tours/guide/my-tours");
  const outcome = data === "already" ? "already" : "checked_in";
  return {
    success: true,
    outcome,
    bookingId,
    message: outcome === "already" ? "Already checked in." : "Checked in.",
  };
}

/** Scanned ticket: the signature and expiry are checked before the database is asked. */
export async function checkInByScan(scanned: string): Promise<CheckInResult> {
  const secret = getQrSecret();
  if (!secret) return { success: false, error: "QR check-in is not set up on this site yet." };

  const token = extractQrToken(String(scanned ?? ""));
  if (!token) return { success: false, error: "This QR code is not a CONNECT-Daet ticket." };
  const claims = verifyQrToken(token, secret);
  if (!claims.ok) {
    return {
      success: false,
      error: claims.reason === "expired" ? "This ticket has expired." : "This ticket is not valid. It may be altered or fake.",
    };
  }
  if (claims.type !== "booking") return { success: false, error: "This is a guide badge, not a booking ticket." };
  return checkIn(claims.id, null, "qr");
}

/** Roster fallback: check in the whole party (no participant) or one named guest. */
export async function checkInManually(formData: FormData): Promise<CheckInResult> {
  const bookingId = formData.get("bookingId");
  const participantId = formData.get("participantId");
  if (typeof bookingId !== "string" || !isUuid(bookingId)) return { success: false, error: "Booking not found." };
  if (participantId !== null && participantId !== "" && (typeof participantId !== "string" || !isUuid(participantId))) {
    return { success: false, error: "Guest not found." };
  }
  return checkIn(bookingId, typeof participantId === "string" && participantId ? participantId : null, "manual");
}
