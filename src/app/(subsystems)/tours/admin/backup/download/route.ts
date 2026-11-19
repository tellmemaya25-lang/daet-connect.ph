import { ADMIN_BACKUP_ITEMS, parseBackupFormat, parseBackupItems } from "@/lib/tours/backup";
import { adminBackupAccess } from "@/lib/tours/backup-access.server";
import { loadAdminBackup } from "@/lib/tours/backup-admin.server";
import { backupRefusal, backupResponse } from "@/lib/tours/backup-response.server";

/** Records across the whole system for a Tourism Office admin, as a ZIP of CSV files or one JSON file. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const items = parseBackupItems(url.searchParams.getAll("items"), ADMIN_BACKUP_ITEMS);
  if (items.length === 0) return backupRefusal("Choose at least one thing to save.", 400);
  const access = await adminBackupAccess();
  if (!access.ok) return backupRefusal("Not available", access.status);
  try {
    const tables = await loadAdminBackup(access.supabase, items);
    return backupResponse({ tables, format: parseBackupFormat(url.searchParams.get("format")), owner: access.owner });
  } catch (error) {
    console.error("Admin backup error:", error);
    return backupRefusal("The backup could not be built. Please try again.", 500);
  }
}
