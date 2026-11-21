import { AdminPage } from "@/components/admin/admin-page";
import { BackupPanel } from "@/components/backup/backup-panel";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { ADMIN_BACKUP_ITEMS } from "@/lib/tours/backup";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";

export const metadata = { title: "Data backup" };

export default async function AdminBackupPage() {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next="/tours/admin/backup" />;
  return (
    <AdminPage>
      <AdminPageHeading title="Data backup" backHref="/tours/admin" backLabel="Admin dashboard" />
      <BackupPanel
        action="/tours/admin/backup/download"
        items={ADMIN_BACKUP_ITEMS}
        privacyNote="This file includes personal contact details for bookings, operators, guides and accounts. Keep it private. Bank, GCash, permit and ID details are never included."
        intro="Download records across the whole system. Choose what to save. Bookings, operators, guides and accounts include personal contact details, so keep the file private. Bank, GCash, permit and ID details are never included."
      />
    </AdminPage>
  );
}
