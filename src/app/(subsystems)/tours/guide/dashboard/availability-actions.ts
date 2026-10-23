"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { userFacingDbError } from "@/lib/tours/db-errors";
import { isDateKey, toManilaDateKey } from "@/lib/tours/events-calendar";
import type { AvailabilityState } from "@/lib/tours/dashboards";

const MAX_DAYS_AHEAD = 366;

/** Guide marks a future day as available, unavailable, or clears it. RLS limits writes to their own rows. */
export async function setGuideAvailability(date: string, state: AvailabilityState): Promise<{ success: boolean; error?: string }> {
  if (!isDateKey(date) || !["unset", "available", "unavailable"].includes(state)) return { success: false, error: "Choose a valid day." };
  const today = toManilaDateKey(new Date());
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + MAX_DAYS_AHEAD);
  if (date < today || date > limit.toISOString().slice(0, 10)) return { success: false, error: "You can only set days from today up to a year ahead." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Please sign in again." };
  const { data: guide } = await supabase.from("tours_guides").select("id, accreditation_status").eq("profile_id", user.id).maybeSingle();
  if (!guide || guide.accreditation_status !== "approved") return { success: false, error: "Only approved guides can set availability." };

  const { error } =
    state === "unset"
      ? await supabase.from("tours_guide_availability").delete().eq("guide_id", guide.id).eq("available_date", date)
      : await supabase
          .from("tours_guide_availability")
          .upsert({ guide_id: guide.id, available_date: date, is_available: state === "available" }, { onConflict: "guide_id,available_date" });
  if (error) return { success: false, error: userFacingDbError(error, "Your availability could not be saved.") };
  revalidatePath("/tours/guide/dashboard");
  return { success: true };
}
