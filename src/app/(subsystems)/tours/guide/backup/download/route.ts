import { GUIDE_BACKUP_ITEMS, parseBackupFormat, parseBackupItems } from "@/lib/tours/backup";
import { guideBackupAccess } from "@/lib/tours/backup-access.server";
import { loadGuideBackup } from "@/lib/tours/backup-guide.server";
import { backupRefusal, backupResponse } from "@/lib/tours/backup-response.server";

/** The signed-in, approved guide's own data, as a ZIP of CSV files or one JSON file. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const items = parseBackupItems(url.searchParams.getAll("items"), GUIDE_BACKUP_ITEMS);
  if (items.length === 0) return backupRefusal("Choose at least one thing to save.", 400);
  const access = await guideBackupAccess();
  if (!access.ok) return backupRefusal("Not available", access.status);
  try {
    const tables = await loadGuideBackup(access.supabase, access.guideId, items);
    return backupResponse({ tables, format: parseBackupFormat(url.searchParams.get("format")), owner: access.owner });
  } catch (error) {
    console.error("Guide backup error:", error);
    return backupRefusal("The backup could not be built. Please try again.", 500);
  }
}
