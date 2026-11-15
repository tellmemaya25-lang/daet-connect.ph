"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { userFacingDbError } from "@/lib/tours/db-errors";
import { isMunicipality, parsePesoInput } from "@/lib/tours/municipalities";
import { isUuid } from "@/lib/tours/operator-access";
import { validateVehicles, type VehicleDraft } from "@/lib/tours/door-pickup";

export type SettingsResult = { ok: boolean; message: string };

function revalidatePackage(packageId: string) {
  revalidatePath(`/tours/operator/packages/${packageId}`);
  revalidatePath(`/tours/packages/${packageId}`);
  revalidatePath(`/tours/packages/${packageId}/book`);
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

/** Replaces the package's door-pickup vehicles. Ownership is checked by tours_set_pickup_vehicles. */
export async function saveDoorPickupVehicles(packageId: string, drafts: VehicleDraft[]): Promise<SettingsResult> {
  if (!isUuid(packageId) || !Array.isArray(drafts)) return { ok: false, message: "This tour could not be found." };
  const supabase = await createSupabaseServerClient();
  const { data: rates } = await supabase.from("tours_official_pickup_rates").select("vehicle");
  const checked = validateVehicles(drafts, (rates ?? []).map((r) => r.vehicle));
  if (!checked.ok) return { ok: false, message: checked.error };
  const { error } = await supabase.rpc("tours_set_pickup_vehicles", { p_package_id: packageId, p_vehicles: checked.vehicles });
  if (error) {
    console.error("Save pickup vehicles error:", error);
    return { ok: false, message: userFacingDbError(error, "The pickup vehicles could not be saved. Please try again.") };
  }
  revalidatePackage(packageId);
  return { ok: true, message: checked.vehicles.length ? `Door pickup on: ${checked.vehicles.length} vehicle${checked.vehicles.length === 1 ? "" : "s"}.` : "Door pickup turned off." };
}
