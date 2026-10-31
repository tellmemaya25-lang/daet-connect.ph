"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/tours/operator-access";
import { parseTripDetails, type TripDetailsInput } from "@/lib/tours/trip-details-form";

export type TripDetailsResult = { ok: boolean; message: string; errors: Record<string, string> };

/** Saves a package's itinerary, extras, price rules and terms. Ownership and status rules are checked by tours_save_package_details. */
export async function saveTripDetails(packageId: string, input: TripDetailsInput, full: boolean): Promise<TripDetailsResult> {
  if (!isUuid(packageId)) return { ok: false, message: "This package could not be found.", errors: {} };
  const parsed = parseTripDetails(input, full);
  if (!parsed.ok) return { ok: false, message: "Please fix the highlighted fields.", errors: parsed.errors };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_save_package_details", { p_package_id: packageId, p_details: parsed.payload });
  if (error) {
    console.error("Save trip details error:", error);
    const known = error.code === "42501" || error.code === "23514" || error.code === "P0001";
    return { ok: false, message: known && error.message ? error.message : "Your trip details could not be saved. Please try again.", errors: {} };
  }
  revalidatePath(`/tours/operator/packages/${packageId}`);
  revalidatePath(`/tours/operator/packages/${packageId}/details`);
  revalidatePath(`/tours/packages/${packageId}`);
  return { ok: true, message: "Trip details saved.", errors: {} };
}
