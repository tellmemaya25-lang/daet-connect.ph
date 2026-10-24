"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { removePromoImage, requirePromoAdmin, uploadPromoImage } from "@/lib/tours/promo-admin";
import { readPromoImage, type PromoFormState } from "@/lib/tours/promo-validation";
import { parseAttractionForm, parseAttractionsCsv } from "@/lib/tours/attractions";
import { isUuid } from "@/lib/tours/operator-access";

const CSV_MAX_BYTES = 1024 * 1024;

function revalidateAttractionPages(slug?: string) {
  revalidatePath("/tours/attractions");
  revalidatePath("/tours/admin/attractions");
  if (slug) revalidatePath(`/tours/attractions/${slug}`);
}

export async function saveAttraction(_prev: PromoFormState, formData: FormData): Promise<PromoFormState> {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return { message: admin.error, errors: {} };

  const parsed = parseAttractionForm(formData);
  if (!parsed.ok) return { message: "Please fix the highlighted fields.", errors: parsed.errors };

  const image = readPromoImage(formData);
  if (image.error) return { message: image.error, errors: { image: image.error } };

  const idValue = formData.get("id");
  const id = typeof idValue === "string" && isUuid(idValue) ? idValue : null;

  let previous: { photo_url: string | null; slug: string } | null = null;
  if (id) {
    const { data, error } = await admin.supabase.from("tours_attractions").select("photo_url, slug").eq("id", id).maybeSingle();
    if (error || !data) return { message: "This attraction no longer exists.", errors: {} };
    previous = data;
  }

  let photoUrl = previous?.photo_url ?? null;
  if (image.file) {
    const uploaded = await uploadPromoImage(admin.supabase, image.file, "attractions");
    if ("error" in uploaded) return { message: uploaded.error, errors: { image: uploaded.error } };
    photoUrl = uploaded.url;
  } else if (formData.get("removeImage") === "on") {
    photoUrl = null;
  }

  const row = { ...parsed.data, photo_url: photoUrl };
  const { error } = id
    ? await admin.supabase.from("tours_attractions").update(row).eq("id", id)
    : await admin.supabase.from("tours_attractions").insert(row);

  if (error) {
    if (image.file) await removePromoImage(admin.supabase, photoUrl);
    if (error.code === "23505") return { message: "Another attraction already uses that web address.", errors: { slug: "Choose a different slug." } };
    console.error("Save attraction error:", error);
    return { message: "The attraction could not be saved. Please try again.", errors: {} };
  }

  if (previous?.photo_url && previous.photo_url !== photoUrl) await removePromoImage(admin.supabase, previous.photo_url);
  revalidateAttractionPages(parsed.data.slug);
  if (previous && previous.slug !== parsed.data.slug) revalidatePath(`/tours/attractions/${previous.slug}`);
  redirect("/tours/admin/attractions?saved=1");
}

export async function deleteAttraction(formData: FormData): Promise<void> {
  const admin = await requirePromoAdmin();
  if (!admin.ok) redirect("/tours/admin/attractions?error=unauthorized");

  const id = formData.get("id");
  if (typeof id !== "string" || !isUuid(id)) redirect("/tours/admin/attractions");

  const { data: deleted, error } = await admin.supabase
    .from("tours_attractions")
    .delete()
    .eq("id", id)
    .select("photo_url, slug")
    .maybeSingle();
  if (error) {
    console.error("Delete attraction error:", error);
    redirect("/tours/admin/attractions?error=delete");
  }
  await removePromoImage(admin.supabase, deleted?.photo_url ?? null);
  revalidateAttractionPages(deleted?.slug);
  redirect("/tours/admin/attractions?deleted=1");
}

export type ImportState = { message: string | null; errors: Array<{ line: number; message: string }>; imported?: number; skipped?: number };

/**
 * Bulk-loads the Tourism Office list. All rows are validated first; nothing
 * is saved if any row has a problem. Rows whose slug already exists are
 * skipped, so re-importing the same file is safe.
 */
export async function importAttractionsCsv(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return { message: admin.error, errors: [] };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { message: "Choose a CSV file.", errors: [] };
  if (file.size > CSV_MAX_BYTES) return { message: "The file is larger than 1 MB.", errors: [] };
  if (!/\.csv$/i.test(file.name) && !file.type.includes("csv") && file.type !== "text/plain") return { message: "Upload a .csv file.", errors: [] };

  const parsed = parseAttractionsCsv(await file.text());
  if (parsed.errors.length) return { message: `Nothing was imported. Fix ${parsed.errors.length} row(s) and try again.`, errors: parsed.errors };

  const { data: existing } = await admin.supabase.from("tours_attractions").select("slug").in("slug", parsed.rows.map((r) => r.slug));
  const taken = new Set((existing ?? []).map((row) => row.slug));
  const fresh = parsed.rows.filter((row) => !taken.has(row.slug));
  if (fresh.length) {
    const { error } = await admin.supabase.from("tours_attractions").insert(fresh);
    if (error) {
      console.error("Import attractions error:", error);
      return { message: "The import failed. Nothing was saved. Please try again.", errors: [] };
    }
  }
  revalidateAttractionPages();
  return {
    message: `Imported ${fresh.length} attraction(s).${taken.size ? ` Skipped ${taken.size} already listed.` : ""}`,
    errors: [],
    imported: fresh.length,
    skipped: taken.size,
  };
}
