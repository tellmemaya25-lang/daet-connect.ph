"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/tours/operator-access";

/** Turns the share link on (new random token) or off. RLS limits this to the owner. */
export async function setItinerarySharing(id: string, shared: boolean): Promise<{ token: string | null; error?: string }> {
  if (!isUuid(id)) return { token: null, error: "Plan not found." };
  const supabase = await createSupabaseServerClient();
  const token = shared ? crypto.randomUUID() : null;
  const { data, error } = await supabase.from("tours_itineraries").update({ share_token: token }).eq("id", id).select("id");
  if (error || !data?.length) return { token: null, error: "Sharing could not be changed." };
  revalidatePath(`/tours/my-itineraries/${id}`);
  return { token };
}

export async function deleteItinerary(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || !isUuid(id)) redirect("/tours/my-itineraries");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("tours_itineraries").delete().eq("id", id);
  if (error) console.error("Delete itinerary error:", error);
  revalidatePath("/tours/my-itineraries");
  redirect(error ? "/tours/my-itineraries?error=delete" : "/tours/my-itineraries?deleted=1");
}
