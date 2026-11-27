"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isRole } from "@/lib/tours/accounts";
import { userFacingDbError } from "@/lib/tours/db-errors";
import { isUuid } from "@/lib/tours/operator-access";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";

export type AccountActionResult = { ok: boolean; message: string };

/** Gives an account a new role. The database refuses your own role and a role with no application on file. */
export async function setAccountRole(userId: string, role: string): Promise<AccountActionResult> {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return { ok: false, message: admin.error };
  if (!isUuid(userId) || !isRole(role)) return { ok: false, message: "Choose an account and a role." };
  const { error } = await admin.supabase.rpc("tours_admin_set_role", { p_user_id: userId, p_role: role });
  if (error) return { ok: false, message: userFacingDbError(error, "The role could not be changed.") };
  revalidatePath("/tours/admin/accounts");
  return { ok: true, message: "Role changed. It applies the next time they sign in or their session refreshes." };
}

/**
 * Suspends (or restores) an account: the database records it with the reason
 * and audit entry, then sign-in is banned (or allowed again) in Supabase Auth.
 */
export async function setAccountSuspended(userId: string, suspend: boolean, reason: string): Promise<AccountActionResult> {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return { ok: false, message: admin.error };
  if (!isUuid(userId)) return { ok: false, message: "Account not found." };
  const why = (reason ?? "").trim().slice(0, 300);
  if (suspend && why.length < 3) return { ok: false, message: "Give a reason for the suspension." };

  const { error } = await admin.supabase.rpc("tours_admin_set_suspended", { p_user_id: userId, p_suspended: suspend, p_reason: why });
  if (error) return { ok: false, message: userFacingDbError(error, "The account could not be updated.") };

  try {
    const { error: banError } = await createSupabaseAdminClient().auth.admin.updateUserById(userId, { ban_duration: suspend ? "876000h" : "none" });
    if (banError) throw banError;
  } catch (err) {
    console.error("Auth ban update failed:", err);
    revalidatePath("/tours/admin/accounts");
    return { ok: false, message: suspend ? "Marked suspended, but sign-in could not be blocked. Try again." : "Marked active, but sign-in could not be allowed again. Try again." };
  }
  revalidatePath("/tours/admin/accounts");
  return { ok: true, message: suspend ? "Account suspended. They can no longer sign in." : "Account restored. They can sign in again." };
}

/**
 * Archives a suspended account: moves it to the archive table/state so it can be
 * browsed separately, restored later, or permanently deleted.
 */
export async function archiveAccount(userId: string): Promise<AccountActionResult> {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return { ok: false, message: admin.error };
  if (!isUuid(userId)) return { ok: false, message: "Account not found." };

  const { error } = await admin.supabase.rpc("tours_admin_archive_account", { p_user_id: userId });
  if (error) return { ok: false, message: userFacingDbError(error, "The account could not be archived.") };

  revalidatePath("/tours/admin/accounts");
  return { ok: true, message: "Account archived successfully. It can now be viewed in the archive." };
}

/**
 * Restores an archived account: removes the archive state and reactivates the account.
 */
export async function restoreAccount(userId: string): Promise<AccountActionResult> {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return { ok: false, message: admin.error };
  if (!isUuid(userId)) return { ok: false, message: "Account not found." };

  const { error } = await admin.supabase.rpc("tours_admin_restore_account", { p_user_id: userId });
  if (error) return { ok: false, message: userFacingDbError(error, "The account could not be restored from archive.") };

  // Also lift the sign-in ban in Supabase Auth
  // Trigger Vercel build: updated comment to ensure redeploy after TS2339 fix
  try {
    const { error: banError } = await createSupabaseAdminClient().auth.admin.updateUserById(userId, { ban_duration: "none" });
    if (banError) throw banError;
  } catch (err) {
    console.error("Auth ban lift failed during restore:", err);
    revalidatePath("/tours/admin/accounts");
    return { ok: false, message: "Account restored in database, but sign-in could not be allowed. Try again." };
  }

  revalidatePath("/tours/admin/accounts");
  return { ok: true, message: "Account restored from archive. They can sign in again." };
}

/**
 * Permanently deletes an archived account from the system.
 */
export async function deleteAccount(userId: string): Promise<AccountActionResult> {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return { ok: false, message: admin.error };
  if (!isUuid(userId)) return { ok: false, message: "Account not found." };

  const { error } = await admin.supabase.rpc("tours_admin_delete_account", { p_user_id: userId });
  if (error) return { ok: false, message: userFacingDbError(error, "The account could not be permanently deleted.") };

  // Also delete from Supabase Auth
  // Trigger Vercel build: updated comment to ensure redeploy after TS2339 fix
  try {
    const { error: deleteError } = await createSupabaseAdminClient().auth.admin.deleteUserById(userId);
    if (deleteError) throw deleteError;
  } catch (err) {
    console.error("Auth user deletion failed:", err);
    revalidatePath("/tours/admin/accounts");
    return { ok: false, message: "Account removed from database, but Auth user could not be deleted. Try again." };
  }

  revalidatePath("/tours/admin/accounts");
  return { ok: true, message: "Account permanently deleted from archive." };
}

/**
 * Triggers automatic deletion of archived accounts older than 90 days.
 */
export async function autoDeleteArchive(): Promise<{ ok: boolean; message: string; deletedCount: number }> {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return { ok: false, message: admin.error, deletedCount: 0 };

  const { data: deletedCount, error } = await admin.supabase.rpc("tours_admin_auto_delete_archive");
  if (error) return { ok: false, message: userFacingDbError(error, "Automatic deletion failed."), deletedCount: 0 };

  revalidatePath("/tours/admin/accounts");
  return { ok: true, message: `Automatically deleted ${deletedCount} archived accounts older than 90 days.`, deletedCount };
}
