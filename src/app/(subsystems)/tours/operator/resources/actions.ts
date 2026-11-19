"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedSession } from "@/lib/tours/server-auth";
import { userFacingDbError } from "@/lib/tours/db-errors";
import { type ResourceKind, parseResourceDraft, parseNeedDraft } from "@/lib/tours/operator-resources";

/**
 * An operator's fleet: the boats, vans and drivers a booking claims (20261223).
 *
 * The database counts, not these actions: tours_claim_resources decides whether a
 * boat is free for a tour and refuses the booking when it is not. These actions
 * only record what the operator owns and what each tour needs, so a package with
 * no needs keeps today's per-date seat capacity.
 */

type ActionResult = { success: boolean; error?: string };

async function approvedOperator() {
  const session = await getVerifiedSession();
  if (!session.user) return { error: "You must be logged in." as const };
  const supabase = await createSupabaseServerClient();
  const { data: operator } = await supabase
    .from("tours_operators")
    .select("id, accreditation_status")
    .eq("profile_id", session.user.id)
    .maybeSingle();
  if (!operator) return { error: "Operator profile not found." as const };
  if (operator.accreditation_status !== "approved") return { error: "Your operator account is not approved yet." as const };
  return { operator, supabase };
}

export async function saveResource(input: {
  id?: string | null;
  kind: string;
  name: string;
  seats: number;
  units: number;
  note?: string | null;
}): Promise<ActionResult> {
  try {
    const parsed = parseResourceDraft(input);
    if (!parsed.ok) return { success: false, error: parsed.error };

    const auth = await approvedOperator();
    if ("error" in auth) return { success: false, error: auth.error };
    const { operator, supabase } = auth;

    const row = {
      operator_id: operator.id,
      kind: parsed.value.kind,
      name: parsed.value.name,
      seats: parsed.value.seats,
      units: parsed.value.units,
      note: parsed.value.note,
    };

    const { error } = input.id
      ? await supabase.from("tours_operator_resources").update(row).eq("id", input.id).eq("operator_id", operator.id)
      : await supabase.from("tours_operator_resources").insert(row);

    if (error) {
      return {
        success: false,
        error: userFacingDbError(error, "Could not save that vehicle. Please try again."),
      };
    }
    revalidatePath("/tours/operator/resources");
    return { success: true };
  } catch (error) {
    console.error("Save resource error:", error);
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function setResourceActive(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    const auth = await approvedOperator();
    if ("error" in auth) return { success: false, error: auth.error };
    const { operator, supabase } = auth;

    const { error } = await supabase
      .from("tours_operator_resources")
      .update({ is_active: isActive })
      .eq("id", id)
      .eq("operator_id", operator.id);

    if (error) return { success: false, error: userFacingDbError(error, "Could not update that vehicle.") };
    revalidatePath("/tours/operator/resources");
    return { success: true };
  } catch (error) {
    console.error("Toggle resource error:", error);
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function deleteResource(id: string): Promise<ActionResult> {
  try {
    const auth = await approvedOperator();
    if ("error" in auth) return { success: false, error: auth.error };
    const { operator, supabase } = auth;

    // Refuse while a booking still holds it, rather than silently freeing a
    // trip the operator has already promised.
    const { count } = await supabase
      .from("tours_booking_resource_claims")
      .select("id", { count: "exact", head: true })
      .eq("resource_id", id);
    if ((count ?? 0) > 0) {
      return {
        success: false,
        error: "This vehicle is on upcoming bookings. Turn it off instead, so it stops taking new tours.",
      };
    }

    const { error } = await supabase
      .from("tours_operator_resources")
      .delete()
      .eq("id", id)
      .eq("operator_id", operator.id);

    if (error) return { success: false, error: userFacingDbError(error, "Could not remove that vehicle.") };
    revalidatePath("/tours/operator/resources");
    return { success: true };
  } catch (error) {
    console.error("Delete resource error:", error);
    return { success: false, error: "An unexpected error occurred." };
  }
}

/** What a tour needs: one row per kind, replaced as a set. */
export async function savePackageNeeds(
  packageId: string,
  needs: { kind: string; seatsPerPax: number; unitsPerBooking: number }[],
): Promise<ActionResult> {
  try {
    const auth = await approvedOperator();
    if ("error" in auth) return { success: false, error: auth.error };
    const { operator, supabase } = auth;

    // The package must be this operator's.
    const { data: pkg } = await supabase
      .from("tours_packages")
      .select("id, operator_id")
      .eq("id", packageId)
      .maybeSingle();
    if (!pkg || pkg.operator_id !== operator.id) {
      return { success: false, error: "Package not found." };
    }

    const rows: { package_id: string; kind: ResourceKind; seats_per_pax: number; units_per_booking: number }[] = [];
    for (const need of needs) {
      const parsed = parseNeedDraft(need);
      if (!parsed.ok) return { success: false, error: parsed.error };
      const { kind, seats_per_pax, units_per_booking } = parsed.value;
      if (seats_per_pax === 0 && units_per_booking === 0) continue;
      rows.push({ package_id: packageId, kind, seats_per_pax, units_per_booking });
    }

    // Replace the set. Claims already made on existing bookings stay, because a
    // booking keeps the boat it was promised (tours_booking_resource_claims).
    const { error: dropAll } = await supabase.from("tours_package_resources").delete().eq("package_id", packageId);
    if (dropAll) return { success: false, error: userFacingDbError(dropAll, "Could not update this tour's needs.") };

    if (rows.length) {
      const { error } = await supabase.from("tours_package_resources").insert(rows);
      if (error) return { success: false, error: userFacingDbError(error, "Could not save this tour's needs.") };
    }

    revalidatePath(`/tours/operator/packages/${packageId}/resources`);
    revalidatePath("/tours/operator/resources");
    return { success: true };
  } catch (error) {
    console.error("Save package needs error:", error);
    return { success: false, error: "An unexpected error occurred." };
  }
}
