"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { userFacingDbError } from "@/lib/tours/db-errors";
import { isProfileId } from "@/lib/tours/friends";

type Result = { success: boolean; error?: string };

async function run(fn: string, args: Record<string, unknown>, fallback: string): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(fn as "tours_remove_friend", args as never);
  if (error) return { success: false, error: userFacingDbError(error, fallback) };
  revalidatePath("/tours/friends");
  return { success: true };
}

/** Form actions, bound to a person on the page. The page re-renders once; nothing polls. */
export async function sendFriendRequest(profile: string): Promise<void> {
  if (isProfileId(profile)) await run("tours_send_friend_request", { p_profile: profile }, "Your request could not be sent.");
}

export async function answerFriendRequest(profile: string, accept: boolean): Promise<void> {
  if (isProfileId(profile)) await run("tours_respond_friend_request", { p_profile: profile, p_accept: accept === true }, "Your answer could not be saved.");
}

export async function removeFriend(profile: string): Promise<void> {
  if (isProfileId(profile)) await run("tours_remove_friend", { p_profile: profile }, "That could not be undone.");
}

/** Sets exactly which friends can see a plan. */
export async function shareItineraryWithFriends(itineraryId: string, friendIds: string[]): Promise<Result & { count?: number }> {
  if (!isProfileId(itineraryId) || !friendIds.every(isProfileId) || friendIds.length > 200) return { success: false, error: "Choose friends to share with." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("tours_share_itinerary_with", { p_itinerary: itineraryId, p_friend_ids: friendIds });
  if (error) return { success: false, error: userFacingDbError(error, "The plan could not be shared.") };
  revalidatePath(`/tours/my-itineraries/${itineraryId}`);
  return { success: true, count: Number(data) || 0 };
}
