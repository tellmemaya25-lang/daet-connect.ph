"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { userFacingDbError } from "@/lib/tours/db-errors";
import { manilaLocalToIso, parseSharePct } from "@/lib/tours/guide-applications";
import { isUuid } from "@/lib/tours/operator-access";

/** Operator side of a guide's application. The database checks each step, ownership included, and notifies the guide. */
export type ApplicationResult = { ok: boolean; message: string };

function done(message: string): ApplicationResult {
  revalidatePath("/tours/operator/guides");
  revalidatePath("/tours/operator/bookings");
  revalidatePath("/tours/guide/operators");
  return { ok: true, message };
}

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Sets or moves the interview: a Manila date and time from the picker, and a place or an https link. */
export async function scheduleInterview(id: string, localTime: string, place: string, link: string): Promise<ApplicationResult> {
  if (!isUuid(id)) return { ok: false, message: "Application not found." };
  const at = manilaLocalToIso(clean(localTime));
  if (!at) return { ok: false, message: "Pick a date and time." };
  if (new Date(at).getTime() <= Date.now()) return { ok: false, message: "Pick a time in the future." };
  const p = clean(place);
  const l = clean(link);
  if (!p && !l) return { ok: false, message: "Add a place or an online meeting link." };
  if (p.length > 200) return { ok: false, message: "Keep the place under 200 characters." };
  if (l && !/^https:\/\/\S+$/i.test(l)) return { ok: false, message: "The meeting link must start with https://" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_operator_schedule_interview", { p_id: id, p_at: at, p_place: p, p_link: l });
  if (error) return { ok: false, message: userFacingDbError(error, "The interview could not be set.") };
  return done("Interview set. The guide was asked to confirm.");
}

export async function recordInterview(id: string, passed: boolean, notes: string): Promise<ApplicationResult> {
  if (!isUuid(id) || typeof passed !== "boolean") return { ok: false, message: "Application not found." };
  const n = clean(notes);
  if (n.length > 1000) return { ok: false, message: "Keep notes under 1,000 characters." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_operator_record_interview", { p_id: id, p_passed: passed, p_notes: n });
  if (error) return { ok: false, message: userFacingDbError(error, "The result could not be saved.") };
  return done(passed ? "Passed. Now offer a share of the tour price." : "Recorded. The guide was told.");
}

export async function declineApplication(id: string, note: string): Promise<ApplicationResult> {
  if (!isUuid(id)) return { ok: false, message: "Application not found." };
  const n = clean(note);
  if (n.length > 500) return { ok: false, message: "Keep the note under 500 characters." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_operator_decline_application", { p_id: id, p_note: n });
  if (error) return { ok: false, message: userFacingDbError(error, "The application could not be declined.") };
  return done("Declined. The guide was told.");
}

/** Offers a share of the tour price (first offer, after a decline, or a new one for a team member). */
export async function offerShare(id: string, pctInput: string): Promise<ApplicationResult> {
  if (!isUuid(id)) return { ok: false, message: "Application not found." };
  const pct = parseSharePct(clean(pctInput));
  if (!pct.ok) return { ok: false, message: pct.error };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_operator_offer_share", { p_id: id, p_pct: pct.value });
  if (error) return { ok: false, message: userFacingDbError(error, "The offer could not be sent.") };
  return done(`Offer of ${pct.value}% sent. It applies once the guide accepts.`);
}

export async function endAgreementAsOperator(id: string, note: string): Promise<ApplicationResult> {
  if (!isUuid(id)) return { ok: false, message: "Agreement not found." };
  const n = clean(note);
  if (n.length > 500) return { ok: false, message: "Keep the note under 500 characters." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_end_guide_agreement", { p_id: id, p_note: n });
  if (error) return { ok: false, message: userFacingDbError(error, "The agreement could not be ended.") };
  return done("Agreement ended. Tours they already have stay with them; you can't assign them new ones.");
}

/** Turns automatic assignment on or off: new bookings get the picked guide straight away instead of a proposal. */
export async function setAutoAssign(on: boolean): Promise<ApplicationResult> {
  if (typeof on !== "boolean") return { ok: false, message: "Choose on or off." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_operator_set_auto_assign", { p_on: on });
  if (error) return { ok: false, message: userFacingDbError(error, "The setting could not be saved.") };
  return done(on ? "Automatic assignment is on. New bookings get a guide straight away." : "Automatic assignment is off. New bookings get a proposed guide for you to approve.");
}

/** A package's guides in ranked order (first = first choice); team guides only. */
export async function setPackageGuideRanking(packageId: string, guideIds: string[]): Promise<ApplicationResult> {
  if (!isUuid(packageId) || !Array.isArray(guideIds) || !guideIds.every(isUuid) || guideIds.length > 20) {
    return { ok: false, message: "Choose up to 20 guides from your team." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_operator_set_package_guides", { p_package_id: packageId, p_guide_ids: guideIds });
  if (error) return { ok: false, message: userFacingDbError(error, "The guides could not be saved.") };
  return done(guideIds.length ? "Saved. New bookings for this tour try these guides first, in this order." : "Saved. This tour now uses any free guide on your team who serves its area.");
}
