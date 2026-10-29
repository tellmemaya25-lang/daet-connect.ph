"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { scheduleErrorMessage, SWAP_REASON_MAX, validateSwapReason } from "@/lib/tours/guide-swap";
import { isUuid } from "@/lib/tours/operator-access";

/**
 * Guide swap requests (R6). The guide asks, the operator decides; every rule
 * (assigned guide only, one pending request, the new guide is free that day)
 * is checked by the database RPCs, and their codes become plain messages here.
 */

export type SwapActionResult = { success: boolean; message?: string; error?: string };

const fail = (error: { message?: string | null } | null, fallback: string): SwapActionResult => {
  const message = scheduleErrorMessage(error);
  if (!message) console.error("Guide swap error:", error);
  return { success: false, error: message ?? fallback };
};

const refresh = () => {
  revalidatePath("/tours/guide/my-tours");
  revalidatePath("/tours/guide/dashboard");
  revalidatePath("/tours/operator/bookings");
};

export async function requestGuideSwap(formData: FormData): Promise<SwapActionResult> {
  const bookingId = String(formData.get("bookingId") ?? "");
  const toGuide = String(formData.get("toGuideId") ?? "");
  if (!isUuid(bookingId) || (toGuide && !isUuid(toGuide))) return { success: false, error: "Something is wrong with this request. Reload and try again." };
  const reason = validateSwapReason(formData.get("reason"));
  if (!reason.ok) return { success: false, error: reason.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_request_guide_swap", {
    p_booking: bookingId,
    // null lets the operator choose the replacement.
    p_to_guide: toGuide || (null as unknown as string),
    p_reason: reason.reason,
  });
  if (error) return fail(error, "The request could not be sent. Try again.");
  refresh();
  return { success: true, message: "Sent. The operator will approve or decline it, and you'll get a notification." };
}

export async function cancelGuideSwap(requestId: string): Promise<SwapActionResult> {
  if (!isUuid(requestId)) return { success: false, error: "Unknown request." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_cancel_guide_swap", { p_request: requestId });
  if (error) return fail(error, "The request could not be withdrawn.");
  refresh();
  return { success: true, message: "Request withdrawn. You're still on this tour." };
}

export async function decideGuideSwap(formData: FormData): Promise<SwapActionResult> {
  const requestId = String(formData.get("requestId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const guideId = String(formData.get("guideId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!isUuid(requestId) || (decision !== "approve" && decision !== "reject") || (guideId && !isUuid(guideId))) {
    return { success: false, error: "Something is wrong with this request. Reload and try again." };
  }
  if (note.length > SWAP_REASON_MAX) return { success: false, error: `Keep the note under ${SWAP_REASON_MAX} characters.` };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_decide_guide_swap", {
    p_request: requestId,
    p_approve: decision === "approve",
    p_guide: guideId || undefined,
    p_note: note || undefined,
  });
  if (error) return fail(error, "The decision could not be saved. Try again.");
  refresh();
  return { success: true, message: decision === "approve" ? "Approved. The new guide and the tourist have been notified." : "Declined. The guide stays on this tour." };
}
