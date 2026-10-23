"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { userFacingDbError } from "@/lib/tours/db-errors";
import { isUuid } from "@/lib/tours/operator-access";
import { parseReply, parseReviewForm } from "@/lib/tours/reviews";

export type ReviewActionState = { error: string | null; success: string | null };

function revalidateReviewPages(packageId?: string | null) {
  revalidatePath("/tours/browse");
  revalidatePath("/tours/operator/reviews");
  revalidatePath("/tours/admin/reviews");
  if (packageId) revalidatePath(`/tours/packages/${packageId}`);
}

/** Tourist reviews a completed booking (once). The RPC checks ownership and status. */
export async function submitReview(_prev: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const bookingId = formData.get("bookingId");
  if (typeof bookingId !== "string" || !isUuid(bookingId)) return { error: "Booking not found.", success: null };
  const parsed = parseReviewForm(formData);
  if (!parsed.ok) return { error: parsed.error, success: null };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_submit_review", { p_booking_id: bookingId, p_rating: parsed.rating, p_comment: parsed.comment });
  if (error) return { error: userFacingDbError(error, "Your review could not be saved. Please try again."), success: null };

  const { data: booking } = await supabase.from("tours_bookings").select("package_id").eq("id", bookingId).maybeSingle();
  revalidatePath(`/tours/bookings/${bookingId}`);
  revalidateReviewPages(booking?.package_id);
  return { error: null, success: "Thanks for your review!" };
}

export async function replyToReview(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const reviewId = formData.get("reviewId");
  if (typeof reviewId !== "string" || !isUuid(reviewId)) return { success: false, error: "Review not found." };
  const parsed = parseReply(formData.get("reply"));
  if (!parsed.ok) return { success: false, error: parsed.error };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_reply_to_review", { p_review_id: reviewId, p_reply: parsed.reply });
  if (error) return { success: false, error: userFacingDbError(error, "The reply could not be saved.") };
  const { data } = await supabase.from("tours_reviews").select("package_id").eq("id", reviewId).maybeSingle();
  revalidateReviewPages(data?.package_id);
  return { success: true };
}

export async function setReviewHidden(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const reviewId = formData.get("reviewId");
  if (typeof reviewId !== "string" || !isUuid(reviewId)) return { success: false, error: "Review not found." };
  const hidden = formData.get("hidden") === "true";
  const reason = String(formData.get("reason") ?? "").trim();
  if (hidden && reason.length < 3) return { success: false, error: "Give a short reason for hiding this review." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_set_review_hidden", { p_review_id: reviewId, p_hidden: hidden, p_reason: reason });
  if (error) return { success: false, error: userFacingDbError(error, "The review could not be updated.") };
  const { data } = await supabase.from("tours_reviews").select("package_id").eq("id", reviewId).maybeSingle();
  revalidateReviewPages(data?.package_id);
  return { success: true };
}
