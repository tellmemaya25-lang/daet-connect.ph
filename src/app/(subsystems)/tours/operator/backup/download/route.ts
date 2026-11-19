import { OPERATOR_BACKUP_ITEMS, parseBackupFormat, parseBackupItems } from "@/lib/tours/backup";
import { operatorBackupAccess } from "@/lib/tours/backup-access.server";
import { loadOperatorBackup } from "@/lib/tours/backup-operator.server";
import { backupRefusal, backupResponse } from "@/lib/tours/backup-response.server";

/** The signed-in, approved operator's own data, as a ZIP of CSV files or one JSON file. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const items = parseBackupItems(url.searchParams.getAll("items"), OPERATOR_BACKUP_ITEMS);
  if (items.length === 0) return backupRefusal("Choose at least one thing to save.", 400);
  const access = await operatorBackupAccess();
  if (!access.ok) return backupRefusal("Not available", access.status);
  try {
    const tables = await loadOperatorBackup(access.supabase, access.operatorId, items);
    return backupResponse({ tables, format: parseBackupFormat(url.searchParams.get("format")), owner: access.owner });
  } catch (error) {
    console.error("Operator backup error:", error);
    return backupRefusal("The backup could not be built. Please try again.", 500);
  }
}
