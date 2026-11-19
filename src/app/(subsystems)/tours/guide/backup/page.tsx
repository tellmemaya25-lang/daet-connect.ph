import Link from "next/link";
import { redirect } from "next/navigation";
import { BackupPanel } from "@/components/backup/backup-panel";
import { PageFrame } from "@/components/ui/page-frame";
import { GUIDE_BACKUP_ITEMS } from "@/lib/tours/backup";
import { guideBackupAccess } from "@/lib/tours/backup-access.server";

export const metadata = { title: "Data backup" };

export default async function GuideBackupPage() {
  const access = await guideBackupAccess();
  if (!access.ok) redirect(access.status === 401 ? `/login?next=${encodeURIComponent("/tours/guide/backup")}` : "/dashboard");
  return (
    <PageFrame>
      <Link href="/tours/guide/dashboard" className="inline-flex min-h-11 items-center text-sm font-bold text-daet-forest hover:underline dark:text-blue-300">
        ← Dashboard
      </Link>
      <h1 className="display-2 mb-4 text-daet-ink">Data backup</h1>
      <BackupPanel
        action="/tours/guide/backup/download"
        items={GUIDE_BACKUP_ITEMS}
        intro="Download a copy of your own work and pay to keep. Choose what to save. Tours list the lead guest's name only, and no contact details."
      />
    </PageFrame>
  );
}
