"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { userFacingDbError } from "@/lib/tours/db-errors";
import { isUuid } from "@/lib/tours/operator-access";

/** Guide side of an application to an operator. The database checks each step and notifies the operator. */
export type ApplicationResult = { ok: boolean; message: string };

const PAGE = "/tours/guide/operators";

function done(message: string): ApplicationResult {
  revalidatePath(PAGE);
  revalidatePath("/tours/operator/guides");
  return { ok: true, message };
}

export async function applyToOperator(operatorId: string, message: string): Promise<ApplicationResult> {
  if (!isUuid(operatorId)) return { ok: false, message: "Choose an operator from the list." };
  const text = typeof message === "string" ? message.trim() : "";
  if (text.length > 1000) return { ok: false, message: "Keep your message under 1,000 characters." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_guide_apply", { p_operator_id: operatorId, p_message: text });
  if (error) return { ok: false, message: userFacingDbError(error, "Your application could not be sent.") };
  return done("Application sent. The operator will set up an interview.");
}

export async function withdrawApplication(id: string): Promise<ApplicationResult> {
  if (!isUuid(id)) return { ok: false, message: "Application not found." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_guide_withdraw_application", { p_id: id });
  if (error) return { ok: false, message: userFacingDbError(error, "The application could not be withdrawn.") };
  return done("Application withdrawn.");
}

export async function confirmInterview(id: string): Promise<ApplicationResult> {
  if (!isUuid(id)) return { ok: false, message: "Application not found." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_guide_confirm_interview", { p_id: id });
  if (error) return { ok: false, message: userFacingDbError(error, "The interview could not be confirmed.") };
  return done("Confirmed. The operator knows you'll attend.");
}

export async function answerOffer(id: string, accept: boolean): Promise<ApplicationResult> {
  if (!isUuid(id) || typeof accept !== "boolean") return { ok: false, message: "Offer not found." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_guide_respond_offer", { p_id: id, p_accept: accept });
  if (error) return { ok: false, message: userFacingDbError(error, "Your answer could not be saved.") };
  return done(accept ? "Accepted. The operator can now assign you to their tours." : "Offer declined.");
}

export async function endAgreementAsGuide(id: string, note: string): Promise<ApplicationResult> {
  if (!isUuid(id)) return { ok: false, message: "Agreement not found." };
  const text = typeof note === "string" ? note.trim() : "";
  if (text.length > 500) return { ok: false, message: "Keep the note under 500 characters." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tours_end_guide_agreement", { p_id: id, p_note: text });
  if (error) return { ok: false, message: userFacingDbError(error, "The agreement could not be ended.") };
  return done("Agreement ended. Tours you already have stay with you.");
}
