"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { banDuration } from "@/lib/tours/admin-moderation";
import { userFacingDbError } from "@/lib/tours/db-errors";
import { isUuid } from "@/lib/tours/operator-access";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";

export type ModerationResult = { ok: boolean; message: string };

/** Close a report as dismissed or actioned; the reporter is told. */
export async function resolveReport(reportId: string, status: "actioned" | "dismissed", note: string): Promise<ModerationResult> {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return { ok: false, message: admin.error };
  if (!isUuid(reportId) || (status !== "actioned" && status !== "dismissed")) return { ok: false, message: "Choose a report." };
  const { error } = await admin.supabase.rpc("tours_admin_resolve_report", { p_id: reportId, p_status: status, p_note: (note ?? "").slice(0, 500) });
  if (error) return { ok: false, message: userFacingDbError(error, "The report could not be closed.") };
  revalidatePath("/tours/admin/reports");
  return { ok: true, message: status === "actioned" ? "Marked as acted on." : "Dismissed." };
}

/**
 * Bans an account for `days` (null = until lifted): recorded in the database,
 * then sign-in is blocked in Supabase Auth for the same time.
 */
export async function banAccount(userId: string, days: number | null, reason: string): Promise<ModerationResult> {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return { ok: false, message: admin.error };
  if (!isUuid(userId) || (days !== null && (!Number.isInteger(days) || days < 1 || days > 365))) return { ok: false, message: "Choose an account and a ban length." };
  const why = (reason ?? "").trim().slice(0, 300);
  if (why.length < 3) return { ok: false, message: "Give a reason for the ban." };
  const { error } = await admin.supabase.rpc("tours_admin_ban", { p_user_id: userId, p_days: days, p_reason: why });
  if (error) return { ok: false, message: userFacingDbError(error, "The account could not be banned.") };
  try {
    const { error: banError } = await createSupabaseAdminClient().auth.admin.updateUserById(userId, { ban_duration: banDuration(days) });
    if (banError) throw banError;
  } catch (err) {
    console.error("Auth ban update failed:", err);
    revalidatePath("/tours/admin/reports");
    return { ok: false, message: "Marked banned, but sign-in could not be blocked. Try again." };
  }
  revalidatePath("/tours/admin/reports");
  revalidatePath("/tours/admin/accounts");
  revalidatePath("/tours/admin/reviews");
  return { ok: true, message: days === null ? "Banned until lifted. They can no longer sign in." : `Banned for ${days} days. They can no longer sign in.` };
}
