"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MAX_CAPACITY, parseOpenDatesForm } from "@/lib/tours/availability";
import { userFacingDbError } from "@/lib/tours/db-errors";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { isUuid } from "@/lib/tours/operator-access";

export type OpenDatesState = { message: string | null; error: string | null; errors: Record<string, string> };
export type AvailabilityResult = { success: boolean; message?: string; error?: string };

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** The package must belong to the signed-in, approved operator. RLS checks this again on write. */
async function requireOwnPackage(supabase: Supabase, packageId: unknown): Promise<{ packageId: string } | { error: string }> {
  if (typeof packageId !== "string" || !isUuid(packageId)) return { error: "Package not found." };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const { data: pkg } = await supabase
    .from("tours_packages")
    .select("id, tours_operators!inner ( profile_id, accreditation_status )")
    .eq("id", packageId)
    .eq("tours_operators.profile_id", user.id)
    .maybeSingle();
  if (!pkg) return { error: "Package not found." };
  const operator = Array.isArray(pkg.tours_operators) ? pkg.tours_operators[0] : pkg.tours_operators;
  if (operator?.accreditation_status !== "approved") return { error: "Your operator account must be approved to manage dates." };
  return { packageId };
}

function revalidate(packageId: string) {
  revalidatePath(`/tours/operator/packages/${packageId}/availability`);
  revalidatePath(`/tours/packages/${packageId}/book`);
}

export async function openDates(_prev: OpenDatesState, formData: FormData): Promise<OpenDatesState> {
  const supabase = await createSupabaseServerClient();
  const owned = await requireOwnPackage(supabase, formData.get("packageId"));
  if ("error" in owned) return { message: null, error: owned.error, errors: {} };

  const parsed = parseOpenDatesForm(formData, toManilaDateKey(new Date()));
  if (!parsed.ok) return { message: null, error: null, errors: parsed.errors };

  const { data: existing, error: existingError } = await supabase
    .from("tours_package_availability")
    .select("available_date")
    .eq("package_id", owned.packageId)
    .in("available_date", parsed.data.dates);
  if (existingError) return { message: null, error: "Dates could not be checked. Please try again.", errors: {} };

  const taken = new Set((existing ?? []).map((row) => row.available_date));
  const fresh = parsed.data.dates.filter((date) => !taken.has(date));
  if (fresh.length === 0) {
    return { message: null, error: "All of those dates are already open. Change a date's seats in the list below.", errors: {} };
  }

  const { error } = await supabase
    .from("tours_package_availability")
    .insert(fresh.map((date) => ({ package_id: owned.packageId, available_date: date, capacity_total: parsed.data.capacity })));
  if (error) {
    console.error("Open dates error:", error);
    return { message: null, error: userFacingDbError(error, "Dates could not be opened. Please try again."), errors: {} };
  }

  revalidate(owned.packageId);
  const skipped = taken.size > 0 ? ` ${taken.size} already open date(s) were left as they were.` : "";
  return { message: `Opened ${fresh.length} date(s) with ${parsed.data.capacity} seats each.${skipped}`, error: null, errors: {} };
}

export async function updateDateCapacity(formData: FormData): Promise<AvailabilityResult> {
  const supabase = await createSupabaseServerClient();
  const owned = await requireOwnPackage(supabase, formData.get("packageId"));
  if ("error" in owned) return { success: false, error: owned.error };

  const id = formData.get("availabilityId");
  const capacityText = String(formData.get("capacity") ?? "").trim();
  const capacity = Number(capacityText);
  if (typeof id !== "string" || !isUuid(id)) return { success: false, error: "Date not found." };
  if (!/^\d+$/.test(capacityText) || capacity < 1 || capacity > MAX_CAPACITY) {
    return { success: false, error: `Seats must be a whole number from 1 to ${MAX_CAPACITY}.` };
  }

  const { data, error } = await supabase
    .from("tours_package_availability")
    .update({ capacity_total: capacity })
    .eq("id", id)
    .eq("package_id", owned.packageId)
    .select("id");
  if (error) return { success: false, error: userFacingDbError(error, "Seats could not be updated.") };
  if (!data?.length) return { success: false, error: "Date not found." };

  revalidate(owned.packageId);
  return { success: true, message: "Seats updated." };
}

export async function closeDate(formData: FormData): Promise<AvailabilityResult> {
  const supabase = await createSupabaseServerClient();
  const owned = await requireOwnPackage(supabase, formData.get("packageId"));
  if ("error" in owned) return { success: false, error: owned.error };

  const id = formData.get("availabilityId");
  if (typeof id !== "string" || !isUuid(id)) return { success: false, error: "Date not found." };

  const { data, error } = await supabase
    .from("tours_package_availability")
    .delete()
    .eq("id", id)
    .eq("package_id", owned.packageId)
    .select("id");
  if (error) return { success: false, error: userFacingDbError(error, "The date could not be closed.") };
  if (!data?.length) return { success: false, error: "Date not found." };

  revalidate(owned.packageId);
  return { success: true, message: "Date closed." };
}
