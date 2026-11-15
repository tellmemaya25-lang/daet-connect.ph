"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { userFacingDbError } from "@/lib/tours/db-errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Operator marks the guide fees of completed tours paid, or undoes it. */
export async function markGuideFeesPaid(bookingIds: string[], paid: boolean): Promise<{ success: boolean; changed?: number; error?: string }> {
  const ids = [...new Set(bookingIds)].filter((id) => UUID.test(id));
  if (!ids.length || ids.length > 200) return { success: false, error: "Choose the tours to update." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("tours_operator_mark_guide_fees_paid", { p_booking_ids: ids, p_paid: paid });
  if (error) return { success: false, error: userFacingDbError(error, "The guide fees could not be updated.") };
  revalidatePath("/tours/operator/earnings");
  return { success: true, changed: Number(data) || 0 };
}
