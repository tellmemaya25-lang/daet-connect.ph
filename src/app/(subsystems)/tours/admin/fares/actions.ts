"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";
import type { PromoFormState } from "@/lib/tours/promo-validation";
import { parseFareForm, parseFaresCsv } from "@/lib/tours/guide/csv";
import { isUuid } from "@/lib/tours/operator-access";
import { toManilaDateKey } from "@/lib/tours/events-calendar";

const CSV_MAX_BYTES = 1024 * 1024;
const LIST = "/tours/admin/fares";

export async function saveFare(_prev: PromoFormState, formData: FormData): Promise<PromoFormState> {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return { message: admin.error, errors: {} };

  const parsed = parseFareForm(formData, toManilaDateKey(new Date()));
  if (!parsed.ok) return { message: "Please fix the highlighted fields.", errors: parsed.errors };

  const idValue = formData.get("id");
  const id = typeof idValue === "string" && isUuid(idValue) ? idValue : null;
  const { error } = id
    ? await admin.supabase.from("tours_fares").update(parsed.data).eq("id", id)
    : await admin.supabase.from("tours_fares").insert(parsed.data);
  if (error) {
    if (error.code === "23505") return { message: "This way of travel on this route is already listed. Edit that fare instead.", errors: { mode: "Already listed for this route." } };
    console.error("Save fare error:", error);
    return { message: "The fare could not be saved. Please try again.", errors: {} };
  }
  revalidatePath(LIST);
  redirect(`${LIST}?saved=1`);
}

export async function deleteFare(formData: FormData): Promise<void> {
  const admin = await requirePromoAdmin();
  if (!admin.ok) redirect(`${LIST}?error=unauthorized`);
  const id = formData.get("id");
  if (typeof id !== "string" || !isUuid(id)) redirect(LIST);
  const { error } = await admin.supabase.from("tours_fares").delete().eq("id", id);
  if (error) {
    console.error("Delete fare error:", error);
    redirect(`${LIST}?error=delete`);
  }
  revalidatePath(LIST);
  redirect(`${LIST}?deleted=1`);
}

export type FareImportState = { message: string | null; errors: Array<{ line: number; message: string }> };

/** All rows are checked first; nothing is saved if any row has a problem. Routes already listed for the same way of travel are skipped. */
export async function importFaresCsv(_prev: FareImportState, formData: FormData): Promise<FareImportState> {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return { message: admin.error, errors: [] };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { message: "Choose a CSV file.", errors: [] };
  if (file.size > CSV_MAX_BYTES) return { message: "The file is larger than 1 MB.", errors: [] };

  const parsed = parseFaresCsv(await file.text(), toManilaDateKey(new Date()));
  if (parsed.errors.length) return { message: `Nothing was imported. Fix ${parsed.errors.length} row(s) and try again.`, errors: parsed.errors };

  const { data: existing } = await admin.supabase.from("tours_fares").select("mode, from_name, to_name");
  const key = (r: { mode: string; from_name: string; to_name: string }) => `${r.mode}|${r.from_name.toLowerCase()}|${r.to_name.toLowerCase()}`;
  const taken = new Set((existing ?? []).map(key));
  const fresh = parsed.rows.filter((row) => !taken.has(key(row)));
  if (fresh.length) {
    const { error } = await admin.supabase.from("tours_fares").insert(fresh);
    if (error) {
      console.error("Import fares error:", error);
      return { message: "The import failed. Nothing was saved. Please try again.", errors: [] };
    }
  }
  const skipped = parsed.rows.length - fresh.length;
  revalidatePath(LIST);
  return { message: `Imported ${fresh.length} fare(s).${skipped ? ` Skipped ${skipped} already listed.` : ""}`, errors: [] };
}
