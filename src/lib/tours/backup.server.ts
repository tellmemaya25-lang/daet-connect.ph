import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BackupCell, BackupColumn, BackupItem, BackupTable } from "@/lib/tours/backup";

const PAGE = 1000;
const MAX_ROWS = 50_000;

type Row = Record<string, unknown>;
const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const cell = (v: unknown): BackupCell => (v === undefined || v === null ? null : typeof v === "number" || typeof v === "boolean" ? v : String(v));
const list = (v: unknown) => (Array.isArray(v) ? v.join("; ") : null);

/** Reads a query a thousand rows at a time (the API's own cap), up to a safety limit. */
async function fetchAll(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error("backup query failed");
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < PAGE) break;
  }
  return rows;
}

const table = (columns: BackupColumn[], rows: Row[]): BackupTable => ({
  columns,
  rows: rows.map((row) => Object.fromEntries(columns.map((c) => [c.key, cell(row[c.key])]))),
});

const col = (key: string, label: string): BackupColumn => ({ key, label });

/** Every query below is limited to this operator's own records, whatever the row-level rules allow. */
const LOADERS: Record<BackupItem, (db: SupabaseClient, operatorId: string) => Promise<BackupTable>> = {
  async bookings(db, operatorId) {
    const rows = await fetchAll((from, to) =>
      db
        .from("tours_bookings")
        .select(
          "booking_reference, tour_date, number_of_pax, status, payment_status, price_per_pax, total_amount, total_paid, contact_name, contact_email, contact_phone, special_requests, pickup_note, cancellation_reason, guide_fee, created_at, tours_packages!inner(title, operator_id)",
        )
        .eq("tours_packages.operator_id", operatorId)
        .order("created_at", { ascending: false })
        .range(from, to),
    );
    return table(
      [
        col("booking_reference", "Reference"), col("package", "Package"), col("tour_date", "Tour date"), col("number_of_pax", "Guests"),
        col("status", "Status"), col("payment_status", "Payment status"), col("price_per_pax", "Price per guest (PHP)"),
        col("total_amount", "Total (PHP)"), col("total_paid", "Paid (PHP)"), col("contact_name", "Contact name"),
        col("contact_email", "Contact email"), col("contact_phone", "Contact phone"), col("special_requests", "Special requests"),
        col("pickup_note", "Pickup note"), col("cancellation_reason", "Cancellation reason"), col("guide_fee", "Guide fee (PHP)"), col("created_at", "Booked on"),
      ],
      rows.map((r) => ({ ...r, package: first(r.tours_packages as { title: string } | null)?.title ?? null })),
    );
  },

  async payments(db, operatorId) {
    const rows = await fetchAll((from, to) =>
      db
        .from("tours_payments")
        .select(
          "payment_date, amount, payment_method, payment_status, provider, reference_number, notes, tours_bookings!inner(booking_reference, contact_name, tours_packages!inner(title, operator_id))",
        )
        .eq("tours_bookings.tours_packages.operator_id", operatorId)
        .order("payment_date", { ascending: false })
        .range(from, to),
    );
    return table(
      [
        col("payment_date", "Date"), col("booking_reference", "Booking"), col("tourist", "Tourist"), col("package", "Package"),
        col("amount", "Amount (PHP)"), col("payment_method", "Method"), col("provider", "Channel"), col("payment_status", "Status"),
        col("reference_number", "Reference"), col("notes", "Notes"),
      ],
      rows.map((r) => {
        const booking = first(r.tours_bookings as { booking_reference: string; contact_name: string; tours_packages: unknown } | null);
        return {
          ...r,
          booking_reference: booking?.booking_reference,
          tourist: booking?.contact_name,
          package: first(booking?.tours_packages as { title: string } | null)?.title,
        };
      }),
    );
  },

  async packages(db, operatorId) {
    const rows = await fetchAll((from, to) =>
      db
        .from("tours_packages")
        .select("title, status, location_name, duration_type, duration_value, description, inclusions, exclusions, meeting_point_name, meeting_time, rejection_reason, created_at")
        .eq("operator_id", operatorId)
        .order("created_at", { ascending: false })
        .range(from, to),
    );
    return table(
      [
        col("title", "Title"), col("status", "Status"), col("location_name", "Location"), col("duration_type", "Duration unit"),
        col("duration_value", "Duration"), col("description", "Description"), col("inclusions", "Inclusions"), col("exclusions", "Exclusions"),
        col("meeting_point_name", "Meeting point"), col("meeting_time", "Meeting time"), col("rejection_reason", "Rejection reason"), col("created_at", "Created"),
      ],
      rows.map((r) => ({ ...r, inclusions: list(r.inclusions), exclusions: list(r.exclusions) })),
    );
  },

  async guides(db, operatorId) {
    const apps = await fetchAll((from, to) =>
      db.from("tours_guide_applications").select("guide_id, status, revenue_share_pct, updated_at").eq("operator_id", operatorId).order("updated_at", { ascending: false }).range(from, to),
    );
    const guideIds = [...new Set(apps.map((a) => String(a.guide_id)))];
    const { data: guides } = guideIds.length ? await db.from("tours_guides").select("id, profile_id, contact_phone").in("id", guideIds) : { data: [] };
    const profileIds = (guides ?? []).map((g) => g.profile_id).filter(Boolean);
    const { data: profiles } = profileIds.length ? await db.from("profiles").select("id, full_name").in("id", profileIds) : { data: [] };
    const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    const byId = new Map((guides ?? []).map((g) => [g.id, { name: names.get(g.profile_id) ?? null, phone: g.contact_phone ?? null }]));
    return table(
      [col("name", "Guide"), col("phone", "Phone"), col("status", "Status"), col("revenue_share_pct", "Share of tour price (%)"), col("updated_at", "Updated")],
      apps.map((a) => ({ ...a, name: byId.get(String(a.guide_id))?.name, phone: byId.get(String(a.guide_id))?.phone })),
    );
  },

  async merchandise(db, operatorId) {
    const rows = await fetchAll((from, to) =>
      db
        .from("tours_merchandise")
        .select("name, category, price, seller_name, where_to_buy, contact_info, review_status, is_active, created_at")
        .eq("submitted_by_operator_id", operatorId)
        .order("created_at", { ascending: false })
        .range(from, to),
    );
    return table(
      [
        col("name", "Name"), col("category", "Category"), col("price", "Price (PHP)"), col("seller_name", "Seller"), col("where_to_buy", "Where to buy"),
        col("contact_info", "Contact"), col("review_status", "Review status"), col("is_active", "Visible"), col("created_at", "Created"),
      ],
      rows,
    );
  },

  async reviews(db, operatorId) {
    const rows = await fetchAll((from, to) =>
      db
        .from("tours_reviews")
        .select("rating, comment, operator_reply, replied_at, is_hidden, created_at, tours_packages(title)")
        .eq("operator_id", operatorId)
        .order("created_at", { ascending: false })
        .range(from, to),
    );
    return table(
      [
        col("package", "Package"), col("rating", "Rating"), col("comment", "Comment"), col("operator_reply", "Your reply"),
        col("replied_at", "Replied on"), col("is_hidden", "Hidden"), col("created_at", "Reviewed on"),
      ],
      rows.map((r) => ({ ...r, package: first(r.tours_packages as { title: string } | null)?.title ?? null })),
    );
  },
};

export async function loadBackupTables(db: SupabaseClient, operatorId: string, items: BackupItem[]): Promise<Partial<Record<BackupItem, BackupTable>>> {
  const loaded = await Promise.all(items.map(async (id) => [id, await LOADERS[id](db, operatorId)] as const));
  return Object.fromEntries(loaded);
}
