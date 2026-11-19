"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/tours/operator-access";
import { meetingTimeProblem, needsMeetingTime } from "@/lib/tours/meeting-time";

export type MeetingState = { message: string | null; ok: boolean; errors: Record<string, string> };

/** Saves where and when guests meet. Ownership is checked by tours_set_meeting_point. */
export async function saveMeetingPoint(_prev: MeetingState, formData: FormData): Promise<MeetingState> {
  const get = (key: string) => {
    const v = formData.get(key);
    return typeof v === "string" ? v.trim() : "";
  };
  const packageId = get("packageId");
  if (!isUuid(packageId)) return { message: "This tour could not be found.", ok: false, errors: {} };

  const errors: Record<string, string> = {};
  const name = get("name");
  if (name.length > 120) errors.name = "Keep this under 120 characters.";
  const latText = get("latitude");
  const lngText = get("longitude");
  let lat: number | null = null;
  let lng: number | null = null;
  if (latText || lngText) {
    lat = Number(latText);
    lng = Number(lngText);
    if (!latText || !lngText || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < 12 || lat > 16 || lng < 121 || lng > 125) {
      errors.latitude = "Enter both numbers from Google Maps, e.g. 14.1131 and 122.9545, or leave both empty.";
    }
  }
  const time = get("time");
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) errors.time = "Use a time like 06:30.";

  // An hour tour with no time takes the tourist's whole day, which blocks every
  // other tour they might book that date. Day tours genuinely take the day, so
  // only hour tours are asked. Checked here, not as a CHECK constraint: the
  // tours already published without a time must still be editable.
  const supabase = await createSupabaseServerClient();
  const { data: pkg, error: pkgError } = await supabase
    .from("tours_packages")
    .select("duration_type, duration_value")
    .eq("id", packageId)
    .maybeSingle();
  if (pkgError || !pkg) return { message: "This tour could not be found.", ok: false, errors: {} };
  if (!errors.time) {
    const problem = meetingTimeProblem(pkg, time);
    if (problem) errors.time = problem;
  }

  if (!name && (lat !== null || time)) errors.name = "Name the meeting point, e.g. Daet plaza, in front of the church.";
  if (Object.keys(errors).length) return { message: "Please fix the highlighted fields.", ok: false, errors };

  const { error } = await supabase.rpc("tours_set_meeting_point", {
    p_package_id: packageId,
    p_name: name,
    p_lat: lat,
    p_lng: lng,
    p_time: time || null,
  });
  if (error) {
    console.error("Save meeting point error:", error);
    return { message: error.code === "42501" ? "You can only change your own tours." : "The meeting point could not be saved. Please try again.", ok: false, errors: {} };
  }
  revalidatePath(`/tours/operator/packages/${packageId}`);
  revalidatePath(`/tours/packages/${packageId}`);
  return {
    message: needsMeetingTime(pkg) && !name
      ? `Departure time saved. Guests start at ${time}.`
      : name ? "Meeting point saved." : "Meeting point cleared. Guests now see the first stop.",
    ok: true,
    errors: {},
  };
}
