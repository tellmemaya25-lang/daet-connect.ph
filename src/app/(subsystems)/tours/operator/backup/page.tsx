import Link from "next/link";
import { redirect } from "next/navigation";
import { BackupPanel } from "@/components/backup/backup-panel";
import { PageFrame } from "@/components/ui/page-frame";
import { OPERATOR_BACKUP_ITEMS } from "@/lib/tours/backup";
import { operatorBackupAccess } from "@/lib/tours/backup-access.server";

export const metadata = { title: "Data backup" };

export default async function OperatorBackupPage() {
  const access = await operatorBackupAccess();
  if (!access.ok) redirect(access.status === 401 ? `/login?next=${encodeURIComponent("/tours/operator/backup")}` : "/dashboard");
  return (
    <PageFrame>
      <Link href="/tours/operator/dashboard" className="inline-flex min-h-11 items-center text-sm font-bold text-daet-forest hover:underline dark:text-blue-300">
        ← Dashboard
      </Link>
      <h1 className="display-2 mb-4 text-daet-ink">Data backup</h1>
      <BackupPanel
        action="/tours/operator/backup/download"
        items={OPERATOR_BACKUP_ITEMS}
        intro="Download a copy of your own records to keep. Choose what to save. Bank and GCash numbers are never included. Bookings include the guest contact details you already see there, so keep the file private."
      />
    </PageFrame>
  );
}
