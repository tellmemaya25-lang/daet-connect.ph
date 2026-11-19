import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BackupTable, BackupTables, GuideBackupItem } from "@/lib/tours/backup";
import { col, fetchAll, first, table } from "@/lib/tours/backup-core.server";

/** Every query below is limited to this guide's own records, whatever the row-level rules allow. */
const LOADERS: Record<GuideBackupItem, (db: SupabaseClient, guideId: string) => Promise<BackupTable>> = {
  async tours(db, guideId) {
    const rows = await fetchAll((from, to) =>
      db
        .from("tours_bookings")
        .select("booking_reference, tour_date, number_of_pax, status, contact_name, guide_fee, guide_fee_paid_at, tours_packages(title, tours_operators(business_name))")
        .eq("assigned_guide_id", guideId)
        .order("tour_date", { ascending: false })
        .range(from, to),
    );
    return table(
      [
        col("tour_date", "Tour date"), col("booking_reference", "Booking"), col("package", "Tour"), col("operator", "Operator"),
        col("number_of_pax", "Guests"), col("contact_name", "Lead guest"), col("status", "Status"), col("guide_fee", "Your fee (PHP)"), col("guide_fee_paid_at", "Paid on"),
      ],
      rows.map((r) => {
        const pkg = first(r.tours_packages as { title: string; tours_operators: unknown } | null);
        return { ...r, package: pkg?.title, operator: first(pkg?.tours_operators as { business_name: string } | null)?.business_name };
      }),
    );
  },

  async operators(db, guideId) {
    const rows = await fetchAll((from, to) =>
      db
        .from("tours_guide_applications")
        .select("status, revenue_share_pct, updated_at, tours_operators(business_name)")
        .eq("guide_id", guideId)
        .order("updated_at", { ascending: false })
        .range(from, to),
    );
    return table(
      [col("operator", "Operator"), col("status", "Status"), col("revenue_share_pct", "Your share of tour price (%)"), col("updated_at", "Updated")],
      rows.map((r) => ({ ...r, operator: first(r.tours_operators as { business_name: string } | null)?.business_name })),
    );
  },

  async availability(db, guideId) {
    const rows = await fetchAll((from, to) =>
      db.from("tours_guide_availability").select("available_date, start_time, end_time, is_available").eq("guide_id", guideId).order("available_date", { ascending: false }).range(from, to),
    );
    return table([col("available_date", "Date"), col("start_time", "From"), col("end_time", "Until"), col("is_available", "Available")], rows);
  },

  async reviews(db, guideId) {
    const rows = await fetchAll((from, to) =>
      db.from("tours_reviews").select("rating, comment, created_at, tours_packages(title)").eq("guide_id", guideId).order("created_at", { ascending: false }).range(from, to),
    );
    return table(
      [col("package", "Tour"), col("rating", "Rating"), col("comment", "Comment"), col("created_at", "Reviewed on")],
      rows.map((r) => ({ ...r, package: first(r.tours_packages as { title: string } | null)?.title })),
    );
  },
};

export async function loadGuideBackup(db: SupabaseClient, guideId: string, items: GuideBackupItem[]): Promise<BackupTables> {
  const loaded = await Promise.all(items.map(async (id) => [id, await LOADERS[id](db, guideId)] as const));
  return Object.fromEntries(loaded);
}
