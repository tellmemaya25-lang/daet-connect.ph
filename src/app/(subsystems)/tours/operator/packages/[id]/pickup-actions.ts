"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { userFacingDbError } from "@/lib/tours/db-errors";
import { isMunicipality, parsePesoInput } from "@/lib/tours/municipalities";
import { isUuid } from "@/lib/tours/operator-access";
import { validatePickupDrafts, type PickupDraft } from "@/lib/tours/pickup";

export type SettingsResult = { ok: boolean; message: string };

function revalidatePackage(packageId: string) {
  revalidatePath(`/tours/operator/packages/${packageId}`);
  revalidatePath(`/tours/packages/${packageId}`);
  revalidatePath(`/tours/packages/${packageId}/book`);
}

/** Replaces the package's pickup points. Ownership is checked by tours_set_pickup_points. */
export async function savePickupPoints(packageId: string, drafts: PickupDraft[]): Promise<SettingsResult> {
  if (!isUuid(packageId) || !Array.isArray(drafts)) return { ok: false, message: "This tour could not be found." };
  const checked = validatePickupDrafts(drafts);
  if (!checked.ok) return { ok: false, message: checked.error };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_set_pickup_points", { p_package_id: packageId, p_points: checked.points });
  if (error) {
    console.error("Save pickup points error:", error);
    return { ok: false, message: userFacingDbError(error, "The pickup points could not be saved. Please try again.") };
  }
  revalidatePackage(packageId);
  return { ok: true, message: checked.points.length ? `Saved ${checked.points.length} pickup point${checked.points.length === 1 ? "" : "s"}.` : "Pickup points cleared. Guests go to the meeting point." };
}

/** Guide fee (paid per tour to the assigned guide) and the package's municipality. */
export async function saveGuideSettings(packageId: string, guideFee: string, municipality: string): Promise<SettingsResult> {
  if (!isUuid(packageId)) return { ok: false, message: "This tour could not be found." };
  const fee = parsePesoInput(guideFee ?? "");
  if (!fee.ok) return { ok: false, message: "Enter the guide fee in pesos, e.g. 800, or leave it empty." };
  if (municipality && !isMunicipality(municipality)) return { ok: false, message: "Choose a municipality from the list." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_set_package_guide_settings", {
    p_package_id: packageId,
    p_guide_fee: fee.value,
    p_municipality: municipality || null,
  });
  if (error) {
    console.error("Save guide settings error:", error);
    return { ok: false, message: userFacingDbError(error, "The guide settings could not be saved. Please try again.") };
  }
  revalidatePackage(packageId);
  return { ok: true, message: "Guide settings saved. New guide assignments use this fee." };
}
