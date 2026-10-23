"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parsePushSubscription } from "@/lib/tours/notifications";
import { isUuid } from "@/lib/tours/operator-access";

type Result = { success: boolean; error?: string };

async function currentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Saves this browser's push subscription for the signed-in user. An endpoint
 * belongs to one browser, so if someone else signed in on it before, their
 * row is replaced (service role, because RLS hides other users' rows).
 */
export async function savePushSubscription(subscription: unknown): Promise<Result> {
  const parsed = parsePushSubscription(subscription);
  if (!parsed) return { success: false, error: "This browser sent an invalid push subscription." };
  const userId = await currentUserId();
  if (!userId) return { success: false, error: "Please sign in again." };

  try {
    const admin = createSupabaseAdminClient();
    await admin.from("push_subscriptions").delete().eq("endpoint", parsed.endpoint).neq("profile_id", userId);
    const { error } = await admin
      .from("push_subscriptions")
      .upsert({ profile_id: userId, endpoint: parsed.endpoint, p256dh_key: parsed.p256dh, auth_key: parsed.auth }, { onConflict: "endpoint" });
    if (error) throw error;
  } catch (error) {
    console.error("Save push subscription error:", error);
    return { success: false, error: "Notifications could not be turned on. Please try again." };
  }
  return { success: true };
}

export async function removePushSubscription(endpoint: unknown): Promise<Result> {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return { success: false };
  const supabase = await createSupabaseServerClient();
  // RLS: users can only remove their own subscriptions.
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return error ? { success: false, error: "Could not turn off notifications." } : { success: true };
}

export async function markNotificationsRead(ids?: string[]): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { success: false, error: "Please sign in again." };
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("tours_notifications").update({ read_at: new Date().toISOString() }).eq("profile_id", userId).is("read_at", null);
  if (ids) {
    const valid = ids.filter((id) => typeof id === "string" && isUuid(id)).slice(0, 100);
    if (valid.length === 0) return { success: true };
    query = query.in("id", valid);
  }
  const { error } = await query;
  if (error) {
    console.error("Mark notifications read error:", error);
    return { success: false, error: "Could not update notifications." };
  }
  revalidatePath("/tours/notifications");
  return { success: true };
}
