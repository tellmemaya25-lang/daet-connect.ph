import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedSession, getAuthUser, getVerifiedSession } from "@/lib/tours/server-auth";

export type BackupAccess<Extra> = { ok: true; supabase: SupabaseClient; owner: string } & Extra | { ok: false; status: 401 | 403 };

/** The signed-in, approved operator. `owner` names the business in the file. */
export async function operatorBackupAccess(): Promise<BackupAccess<{ operatorId: string }>> {
  const user = await getAuthUser();
  if (!user) return { ok: false, status: 401 };
  const supabase = await createSupabaseServerClient();
  const [session, { data: operator }] = await Promise.all([
    getAuthenticatedSession(),
    supabase.from("tours_operators").select("id, business_name, accreditation_status").eq("profile_id", user.id).maybeSingle(),
  ]);
  if (session.role !== "operator" || !operator || operator.accreditation_status !== "approved") return { ok: false, status: 403 };
  return { ok: true, supabase, owner: operator.business_name, operatorId: operator.id };
}

/** The signed-in, approved guide. */
export async function guideBackupAccess(): Promise<BackupAccess<{ guideId: string }>> {
  const user = await getAuthUser();
  if (!user) return { ok: false, status: 401 };
  const supabase = await createSupabaseServerClient();
  const [session, { data: guide }, { data: profile }] = await Promise.all([
    getAuthenticatedSession(),
    supabase.from("tours_guides").select("id, accreditation_status").eq("profile_id", user.id).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  if (session.role !== "guide" || !guide || guide.accreditation_status !== "approved") return { ok: false, status: 403 };
  return { ok: true, supabase, owner: profile?.full_name?.trim() || "Guide", guideId: guide.id };
}

/** A Tourism Office admin, checked again on the server. */
export async function adminBackupAccess(): Promise<BackupAccess<object>> {
  const session = await getVerifiedSession();
  if (!session.user) return { ok: false, status: 401 };
  if (session.error || session.role !== "admin") return { ok: false, status: 403 };
  return { ok: true, supabase: await createSupabaseServerClient(), owner: "Tourism Office" };
}
