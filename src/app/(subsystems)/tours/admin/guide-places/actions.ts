"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";
import type { PromoFormState } from "@/lib/tours/promo-validation";
import { parseGuidePlaceForm, parseGuidePlacesCsv } from "@/lib/tours/guide/csv";
import { isUuid } from "@/lib/tours/operator-access";
import { toManilaDateKey } from "@/lib/tours/events-calendar";

const CSV_MAX_BYTES = 1024 * 1024;
const LIST = "/tours/admin/guide-places";

export async function saveGuidePlace(_prev: PromoFormState, formData: FormData): Promise<PromoFormState> {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return { message: admin.error, errors: {} };

  const parsed = parseGuidePlaceForm(formData, toManilaDateKey(new Date()));
  if (!parsed.ok) return { message: "Please fix the highlighted fields.", errors: parsed.errors };

  const idValue = formData.get("id");
  const id = typeof idValue === "string" && isUuid(idValue) ? idValue : null;
  const { error } = id
    ? await admin.supabase.from("tours_guide_places").update(parsed.data).eq("id", id)
    : await admin.supabase.from("tours_guide_places").insert(parsed.data);
  if (error) {
    if (error.code === "23505") return { message: "Another place already uses that web address.", errors: { slug: "Choose a different slug." } };
    console.error("Save guide place error:", error);
    return { message: "The place could not be saved. Please try again.", errors: {} };
  }
  revalidatePath(LIST);
  redirect(`${LIST}?saved=1`);
}

export async function deleteGuidePlace(formData: FormData): Promise<void> {
  const admin = await requirePromoAdmin();
  if (!admin.ok) redirect(`${LIST}?error=unauthorized`);
  const id = formData.get("id");
  if (typeof id !== "string" || !isUuid(id)) redirect(LIST);
  const { error } = await admin.supabase.from("tours_guide_places").delete().eq("id", id);
  if (error) {
    console.error("Delete guide place error:", error);
    redirect(`${LIST}?error=delete`);
  }
  revalidatePath(LIST);
  redirect(`${LIST}?deleted=1`);
}

export type GuideImportState = { message: string | null; errors: Array<{ line: number; message: string }> };

/** All rows are checked first; nothing is saved if any row has a problem. Existing slugs are skipped. */
export async function importGuidePlacesCsv(_prev: GuideImportState, formData: FormData): Promise<GuideImportState> {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return { message: admin.error, errors: [] };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { message: "Choose a CSV file.", errors: [] };
  if (file.size > CSV_MAX_BYTES) return { message: "The file is larger than 1 MB.", errors: [] };

  const parsed = parseGuidePlacesCsv(await file.text(), toManilaDateKey(new Date()));
  if (parsed.errors.length) return { message: `Nothing was imported. Fix ${parsed.errors.length} row(s) and try again.`, errors: parsed.errors };

  const { data: existing } = await admin.supabase.from("tours_guide_places").select("slug").in("slug", parsed.rows.map((r) => r.slug));
  const taken = new Set((existing ?? []).map((row) => row.slug));
  const fresh = parsed.rows.filter((row) => !taken.has(row.slug));
  if (fresh.length) {
    const { error } = await admin.supabase.from("tours_guide_places").insert(fresh);
    if (error) {
      console.error("Import guide places error:", error);
      return { message: "The import failed. Nothing was saved. Please try again.", errors: [] };
    }
  }
  revalidatePath(LIST);
  return { message: `Imported ${fresh.length} place(s).${taken.size ? ` Skipped ${taken.size} already listed.` : ""}`, errors: [] };
}
