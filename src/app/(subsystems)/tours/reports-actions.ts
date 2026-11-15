"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { userFacingDbError } from "@/lib/tours/db-errors";
import { isReportReason, isReportTarget } from "@/lib/tours/admin-moderation";
import { isUuid } from "@/lib/tours/operator-access";

/** Anyone signed in reports a review, an account or a package. One open report per target. */
export async function submitReport(type: string, targetId: string, reason: string, details: string): Promise<{ success: boolean; error?: string }> {
  if (!isReportTarget(type) || !isUuid(targetId)) return { success: false, error: "That could not be reported." };
  if (!isReportReason(reason)) return { success: false, error: "Choose a reason." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_submit_report", { p_type: type, p_target: targetId, p_reason: reason, p_details: (details ?? "").slice(0, 1000) });
  if (error) return { success: false, error: userFacingDbError(error, "Your report could not be sent.") };
  return { success: true };
}
