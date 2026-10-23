"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { removePromoImage, requirePromoAdmin, uploadPromoImage } from "@/lib/tours/promo-admin";
import { parseEventForm, readPromoImage, type PromoFormState } from "@/lib/tours/promo-validation";

function revalidateEventPages(id?: string) {
  revalidatePath("/");
  revalidatePath("/tours/events");
  revalidatePath("/tours/admin/events");
  if (id) revalidatePath(`/tours/events/${id}`);
}

export async function saveEvent(_prev: PromoFormState, formData: FormData): Promise<PromoFormState> {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return { message: admin.error, errors: {} };

  const parsed = parseEventForm(formData);
  if (!parsed.ok) return { message: "Please fix the highlighted fields.", errors: parsed.errors };

  const image = readPromoImage(formData);
  if (image.error) return { message: image.error, errors: { image: image.error } };

  const idValue = formData.get("id");
  const id = typeof idValue === "string" && idValue ? idValue : null;

  let previousImageUrl: string | null = null;
  if (id) {
    const { data: existing, error } = await admin.supabase
      .from("tours_events")
      .select("id,image_url")
      .eq("id", id)
      .maybeSingle();
    if (error || !existing) return { message: "This event no longer exists.", errors: {} };
    previousImageUrl = existing.image_url;
  }

  let imageUrl = previousImageUrl;
  if (image.file) {
    const uploaded = await uploadPromoImage(admin.supabase, image.file, "events");
    if ("error" in uploaded) return { message: uploaded.error, errors: { image: uploaded.error } };
    imageUrl = uploaded.url;
  } else if (formData.get("removeImage") === "on") {
    imageUrl = null;
  }

  const row = { ...parsed.data, image_url: imageUrl };
  const { data: saved, error: saveError } = id
    ? await admin.supabase.from("tours_events").update(row).eq("id", id).select("id").single()
    : await admin.supabase
        .from("tours_events")
        .insert({ ...row, created_by: admin.userId })
        .select("id")
        .single();

  if (saveError || !saved) {
    console.error("Save event error:", saveError);
    if (image.file) await removePromoImage(admin.supabase, imageUrl);
    return { message: "The event could not be saved. Please try again.", errors: {} };
  }

  if (previousImageUrl && previousImageUrl !== imageUrl) {
    await removePromoImage(admin.supabase, previousImageUrl);
  }

  revalidateEventPages(saved.id);
  redirect("/tours/admin/events?saved=1");
}

export async function deleteEvent(formData: FormData): Promise<void> {
  const admin = await requirePromoAdmin();
  if (!admin.ok) redirect("/tours/admin/events?error=unauthorized");

  const id = formData.get("id");
  if (typeof id !== "string" || !id) redirect("/tours/admin/events");

  const { data: deleted, error } = await admin.supabase
    .from("tours_events")
    .delete()
    .eq("id", id)
    .select("image_url")
    .maybeSingle();

  if (error) {
    console.error("Delete event error:", error);
    redirect("/tours/admin/events?error=delete");
  }

  await removePromoImage(admin.supabase, deleted?.image_url ?? null);
  revalidateEventPages(id);
  redirect("/tours/admin/events?deleted=1");
}
