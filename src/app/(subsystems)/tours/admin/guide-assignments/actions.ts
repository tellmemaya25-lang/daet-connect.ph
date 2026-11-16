"use server";

import { revalidatePath } from "next/cache";
import { userFacingDbError } from "@/lib/tours/db-errors";
import { isUuid } from "@/lib/tours/operator-access";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";

export type AssignmentResult = { ok: boolean; message: string };

/**
 * Proposes a guide for a booking (null = let the system pick the least busy
 * free guide on the operator's team). The booking's operator approves it.
 */
export async function proposeGuide(bookingId: string, guideId: string | null): Promise<AssignmentResult> {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return { ok: false, message: admin.error };
  if (!isUuid(bookingId) || (guideId !== null && !isUuid(guideId))) return { ok: false, message: "Choose a booking and a guide." };
  const { data, error } = await admin.supabase.rpc("tours_admin_propose_guide", { p_booking_id: bookingId, p_guide_id: guideId });
  if (error) return { ok: false, message: userFacingDbError(error, "The guide could not be proposed.") };
  revalidatePath("/tours/admin/guide-assignments");
  revalidatePath("/tours/operator/bookings");
  return data === "none_available"
    ? { ok: false, message: "No free guide for this tour that day. Pick one by name, or add guides to the package." }
    : { ok: true, message: "Assigned. Waiting for the operator to approve the guide." };
}

/** The guides chosen for one package; its bookings propose them before anyone else. */
export async function setPackageGuides(packageId: string, guideIds: string[]): Promise<AssignmentResult> {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return { ok: false, message: admin.error };
  if (!isUuid(packageId) || !Array.isArray(guideIds) || !guideIds.every(isUuid) || guideIds.length > 20) {
    return { ok: false, message: "Choose up to 20 guides." };
  }
  const { error } = await admin.supabase.rpc("tours_admin_set_package_guides", { p_package_id: packageId, p_guide_ids: guideIds });
  if (error) return { ok: false, message: userFacingDbError(error, "The package's guides could not be saved.") };
  revalidatePath("/tours/admin/guide-assignments");
  revalidatePath(`/tours/operator/packages/${packageId}`);
  return {
    ok: true,
    message: guideIds.length
      ? `Saved. New bookings try ${guideIds.length === 1 ? "this guide" : "these guides"} first.`
      : "No guides of its own: new bookings use guides from the package's municipality.",
  };
}
