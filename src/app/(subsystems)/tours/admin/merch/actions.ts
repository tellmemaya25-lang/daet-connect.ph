"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { removePromoImage, requirePromoAdmin, uploadPromoImage } from "@/lib/tours/promo-admin";
import { parseMerchForm, readPromoImage, type PromoFormState } from "@/lib/tours/promo-validation";

function revalidateMerchPages() {
  revalidatePath("/");
  revalidatePath("/tours/merch");
  revalidatePath("/tours/admin/merch");
}

export async function saveMerch(_prev: PromoFormState, formData: FormData): Promise<PromoFormState> {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return { message: admin.error, errors: {} };

  const parsed = parseMerchForm(formData);
  if (!parsed.ok) return { message: "Please fix the highlighted fields.", errors: parsed.errors };

  const image = readPromoImage(formData);
  if (image.error) return { message: image.error, errors: { image: image.error } };

  const idValue = formData.get("id");
  const id = typeof idValue === "string" && idValue ? idValue : null;

  let previousImageUrl: string | null = null;
  if (id) {
    const { data: existing, error } = await admin.supabase
      .from("tours_merchandise")
      .select("id,image_url")
      .eq("id", id)
      .maybeSingle();
    if (error || !existing) return { message: "This product no longer exists.", errors: {} };
    previousImageUrl = existing.image_url;
  }

  let imageUrl = previousImageUrl;
  if (image.file) {
    const uploaded = await uploadPromoImage(admin.supabase, image.file, "merch");
    if ("error" in uploaded) return { message: uploaded.error, errors: { image: uploaded.error } };
    imageUrl = uploaded.url;
  } else if (formData.get("removeImage") === "on") {
    imageUrl = null;
  }

  const row = { ...parsed.data, image_url: imageUrl };
  const { error: saveError } = id
    ? await admin.supabase.from("tours_merchandise").update(row).eq("id", id)
    : await admin.supabase.from("tours_merchandise").insert({ ...row, created_by: admin.userId });

  if (saveError) {
    console.error("Save merchandise error:", saveError);
    if (image.file) await removePromoImage(admin.supabase, imageUrl);
    return { message: "The product could not be saved. Please try again.", errors: {} };
  }

  if (previousImageUrl && previousImageUrl !== imageUrl) {
    await removePromoImage(admin.supabase, previousImageUrl);
  }

  revalidateMerchPages();
  redirect("/tours/admin/merch?saved=1");
}

export async function deleteMerch(formData: FormData): Promise<void> {
  const admin = await requirePromoAdmin();
  if (!admin.ok) redirect("/tours/admin/merch?error=unauthorized");

  const id = formData.get("id");
  if (typeof id !== "string" || !id) redirect("/tours/admin/merch");

  const { data: deleted, error } = await admin.supabase
    .from("tours_merchandise")
    .delete()
    .eq("id", id)
    .select("image_url")
    .maybeSingle();

  if (error) {
    console.error("Delete merchandise error:", error);
    redirect("/tours/admin/merch?error=delete");
  }

  await removePromoImage(admin.supabase, deleted?.image_url ?? null);
  revalidateMerchPages();
  redirect("/tours/admin/merch?deleted=1");
}
