import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminBackupItem, BackupTable, BackupTables } from "@/lib/tours/backup";
import { col, fetchAll, first, list, table, type Row } from "@/lib/tours/backup-core.server";

const MAX_ACTIVITY = 20_000;

/** Pages an RPC that takes limit and offset (the accounts list caps each page at 100). */
async function rpcAccounts(db: SupabaseClient): Promise<Row[]> {
  const out: Row[] = [];
  for (let offset = 0; offset < 50_000; offset += 100) {
    const { data, error } = await db.rpc("tours_admin_list_accounts", { p_query: null, p_role: null, p_limit: 100, p_offset: offset });
    if (error) throw new Error("backup query failed");
    const page = ((data as { accounts?: Row[] } | null)?.accounts ?? []) as Row[];
    out.push(...page);
    if (page.length < 100) break;
  }
  return out;
}

/** The activity log walks back in time: each page starts before the oldest row of the last. */
async function rpcActivity(db: SupabaseClient): Promise<Row[]> {
  const out: Row[] = [];
  let before: string | undefined;
  while (out.length < MAX_ACTIVITY) {
    const { data, error } = await db.rpc("tours_admin_activity", { p_before: before, p_limit: 200 });
    if (error) throw new Error("backup query failed");
    const page = (Array.isArray(data) ? data : []) as Row[];
    out.push(...page);
    if (page.length < 200) break;
    before = String(page[page.length - 1].at);
  }
  return out;
}

/** Contact details and accreditation only: bank, GCash, permit and ID fields are never selected. */
const LOADERS: Record<AdminBackupItem, (db: SupabaseClient) => Promise<BackupTable>> = {
  async bookings(db) {
    const rows = await fetchAll((from, to) =>
      db
        .from("tours_bookings")
        .select(
          "booking_reference, tour_date, number_of_pax, status, payment_status, total_amount, total_paid, contact_name, contact_email, contact_phone, special_requests, cancellation_reason, guide_fee, created_at, tours_packages(title, tours_operators(business_name))",
        )
        .order("created_at", { ascending: false })
        .range(from, to),
    );
    return table(
      [
        col("booking_reference", "Reference"), col("operator", "Operator"), col("package", "Package"), col("tour_date", "Tour date"), col("number_of_pax", "Guests"),
        col("status", "Status"), col("payment_status", "Payment status"), col("total_amount", "Total (PHP)"), col("total_paid", "Paid (PHP)"),
        col("contact_name", "Contact name"), col("contact_email", "Contact email"), col("contact_phone", "Contact phone"), col("special_requests", "Special requests"),
        col("cancellation_reason", "Cancellation reason"), col("guide_fee", "Guide fee (PHP)"), col("created_at", "Booked on"),
      ],
      rows.map((r) => {
        const pkg = first(r.tours_packages as { title: string; tours_operators: unknown } | null);
        return { ...r, package: pkg?.title, operator: first(pkg?.tours_operators as { business_name: string } | null)?.business_name };
      }),
    );
  },

  async payments(db) {
    const rows = await fetchAll((from, to) =>
      db
        .from("tours_payments")
        .select("payment_date, amount, payment_method, payment_status, provider, reference_number, notes, tours_bookings(booking_reference, contact_name)")
        .order("payment_date", { ascending: false })
        .range(from, to),
    );
    return table(
      [
        col("payment_date", "Date"), col("booking_reference", "Booking"), col("tourist", "Tourist"), col("amount", "Amount (PHP)"), col("payment_method", "Method"),
        col("provider", "Channel"), col("payment_status", "Status"), col("reference_number", "Reference"), col("notes", "Notes"),
      ],
      rows.map((r) => {
        const b = first(r.tours_bookings as { booking_reference: string; contact_name: string } | null);
        return { ...r, booking_reference: b?.booking_reference, tourist: b?.contact_name };
      }),
    );
  },

  async packages(db) {
    const rows = await fetchAll((from, to) =>
      db
        .from("tours_packages")
        .select("title, status, location_name, duration_type, duration_value, description, inclusions, exclusions, rejection_reason, created_at, tours_operators(business_name)")
        .order("created_at", { ascending: false })
        .range(from, to),
    );
    return table(
      [
        col("operator", "Operator"), col("title", "Title"), col("status", "Status"), col("location_name", "Location"), col("duration_type", "Duration unit"),
        col("duration_value", "Duration"), col("description", "Description"), col("inclusions", "Inclusions"), col("exclusions", "Exclusions"),
        col("rejection_reason", "Rejection reason"), col("created_at", "Created"),
      ],
      rows.map((r) => ({ ...r, operator: first(r.tours_operators as { business_name: string } | null)?.business_name, inclusions: list(r.inclusions), exclusions: list(r.exclusions) })),
    );
  },

  async operators(db) {
    const rows = await fetchAll((from, to) =>
      db
        .from("tours_operators")
        .select("business_name, contact_person, contact_email, contact_phone, business_address, business_description, accreditation_status, accreditation_notes, reviewed_at, created_at")
        .order("created_at", { ascending: false })
        .range(from, to),
    );
    return table(
      [
        col("business_name", "Business"), col("contact_person", "Contact person"), col("contact_email", "Email"), col("contact_phone", "Phone"), col("business_address", "Address"),
        col("business_description", "Description"), col("accreditation_status", "Accreditation"), col("accreditation_notes", "Notes"), col("reviewed_at", "Reviewed on"), col("created_at", "Applied on"),
      ],
      rows,
    );
  },

  async guides(db) {
    const rows = await fetchAll((from, to) =>
      db
        .from("tours_guides")
        .select("profile_id, contact_phone, bio, years_experience, specialties, accreditation_status, accreditation_notes, reviewed_at, created_at")
        .order("created_at", { ascending: false })
        .range(from, to),
    );
    const ids = rows.map((r) => String(r.profile_id)).filter(Boolean);
    const names = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db.from("profiles").select("id, full_name").in("id", ids.slice(i, i + 200));
      for (const p of data ?? []) names.set(p.id, p.full_name ?? "");
    }
    return table(
      [
        col("name", "Guide"), col("contact_phone", "Phone"), col("years_experience", "Years guiding"), col("specialties", "Specialties"), col("bio", "Bio"),
        col("accreditation_status", "Accreditation"), col("accreditation_notes", "Notes"), col("reviewed_at", "Reviewed on"), col("created_at", "Applied on"),
      ],
      rows.map((r) => ({ ...r, name: names.get(String(r.profile_id)), specialties: list(r.specialties) })),
    );
  },

  async accounts(db) {
    const rows = await rpcAccounts(db);
    return table(
      [
        col("full_name", "Name"), col("email", "Email"), col("role", "Role"), col("is_suspended", "Suspended"), col("suspended_reason", "Suspension reason"),
        col("last_sign_in_at", "Last sign-in"), col("created_at", "Joined"),
      ],
      rows,
    );
  },

  async attractions(db) {
    const rows = await fetchAll((from, to) =>
      db
        .from("tours_attractions")
        .select("name, category, municipality, address, description, latitude, longitude, entrance_fee, opening_hours, is_active, location_verified, created_at")
        .order("name")
        .range(from, to),
    );
    return table(
      [
        col("name", "Name"), col("category", "Category"), col("municipality", "Municipality"), col("address", "Address"), col("description", "Description"),
        col("latitude", "Latitude"), col("longitude", "Longitude"), col("entrance_fee", "Entrance fee"), col("opening_hours", "Opening hours"),
        col("is_active", "Active"), col("location_verified", "Pin verified"), col("created_at", "Created"),
      ],
      rows.map((r) => ({ ...r, opening_hours: r.opening_hours === null || r.opening_hours === undefined ? null : typeof r.opening_hours === "string" ? r.opening_hours : JSON.stringify(r.opening_hours) })),
    );
  },

  async events(db) {
    const rows = await fetchAll((from, to) =>
      db.from("tours_events").select("title, category, venue, organizer, description, starts_at, ends_at, is_published, created_at").order("starts_at", { ascending: false }).range(from, to),
    );
    return table(
      [
        col("title", "Title"), col("category", "Category"), col("venue", "Venue"), col("organizer", "Organizer"), col("description", "Description"),
        col("starts_at", "Starts"), col("ends_at", "Ends"), col("is_published", "Published"), col("created_at", "Created"),
      ],
      rows,
    );
  },

  async places(db) {
    const rows = await fetchAll((from, to) =>
      db
        .from("tours_guide_places")
        .select("name, kind, municipality, address, phone, description, price_min, price_max, price_unit, is_active, verified, created_at")
        .order("name")
        .range(from, to),
    );
    return table(
      [
        col("name", "Name"), col("kind", "Kind"), col("municipality", "Municipality"), col("address", "Address"), col("phone", "Phone"), col("description", "Description"),
        col("price_min", "Price from (PHP)"), col("price_max", "Price to (PHP)"), col("price_unit", "Price unit"), col("is_active", "Active"), col("verified", "Verified"), col("created_at", "Created"),
      ],
      rows,
    );
  },

  async fares(db) {
    const rows = await fetchAll((from, to) =>
      db
        .from("tours_fares")
        .select("from_name, to_name, mode, fare_min, fare_max, fare_per, minutes_min, minutes_max, schedule_note, source, is_active, verified, checked_on")
        .order("from_name")
        .range(from, to),
    );
    return table(
      [
        col("from_name", "From"), col("to_name", "To"), col("mode", "Mode"), col("fare_min", "Fare from (PHP)"), col("fare_max", "Fare to (PHP)"), col("fare_per", "Fare per"),
        col("minutes_min", "Minutes from"), col("minutes_max", "Minutes to"), col("schedule_note", "Schedule"), col("source", "Source"),
        col("is_active", "Active"), col("verified", "Verified"), col("checked_on", "Checked on"),
      ],
      rows,
    );
  },

  async merchandise(db) {
    const rows = await fetchAll((from, to) =>
      db
        .from("tours_merchandise")
        .select("name, category, price, seller_name, where_to_buy, contact_info, review_status, is_active, is_featured, created_at")
        .order("created_at", { ascending: false })
        .range(from, to),
    );
    return table(
      [
        col("name", "Name"), col("category", "Category"), col("price", "Price (PHP)"), col("seller_name", "Seller"), col("where_to_buy", "Where to buy"),
        col("contact_info", "Contact"), col("review_status", "Review status"), col("is_active", "Visible"), col("is_featured", "Featured"), col("created_at", "Created"),
      ],
      rows,
    );
  },

  async emergency(db) {
    const rows = await fetchAll((from, to) => db.from("tours_emergency_contacts").select("label, kind, phone, area, checked_on, is_active, sort_order").order("sort_order").range(from, to));
    return table([col("label", "Label"), col("kind", "Kind"), col("phone", "Phone"), col("area", "Area"), col("checked_on", "Checked on"), col("is_active", "Active")], rows);
  },

  async reviews(db) {
    const rows = await fetchAll((from, to) =>
      db
        .from("tours_reviews")
        .select("rating, comment, operator_reply, is_hidden, hidden_reason, created_at, tours_packages(title), tours_operators(business_name)")
        .order("created_at", { ascending: false })
        .range(from, to),
    );
    return table(
      [
        col("operator", "Operator"), col("package", "Package"), col("rating", "Rating"), col("comment", "Comment"), col("operator_reply", "Operator reply"),
        col("is_hidden", "Hidden"), col("hidden_reason", "Hidden because"), col("created_at", "Reviewed on"),
      ],
      rows.map((r) => ({
        ...r,
        operator: first(r.tours_operators as { business_name: string } | null)?.business_name,
        package: first(r.tours_packages as { title: string } | null)?.title,
      })),
    );
  },

  async reports(db) {
    const rows = await fetchAll((from, to) =>
      db.from("tours_reports").select("target_type, reason, details, status, resolution_note, resolved_at, created_at").order("created_at", { ascending: false }).range(from, to),
    );
    return table(
      [col("target_type", "About"), col("reason", "Reason"), col("details", "Details"), col("status", "Status"), col("resolution_note", "Resolution"), col("resolved_at", "Resolved on"), col("created_at", "Reported on")],
      rows,
    );
  },

  async activity(db) {
    const rows = await rpcActivity(db);
    return table(
      [
        col("at", "When"), col("actor_name", "Who"), col("actor_role", "Role"), col("action", "Action"), col("entity", "Area"), col("entity_id", "Record"),
        col("changes", "Changes"), col("notes", "Notes"),
      ],
      rows.map((r) => ({ ...r, changes: r.changes && Object.keys(r.changes as object).length ? JSON.stringify(r.changes) : null })),
    );
  },
};

export async function loadAdminBackup(db: SupabaseClient, items: AdminBackupItem[]): Promise<BackupTables> {
  const loaded = await Promise.all(items.map(async (id) => [id, await LOADERS[id](db)] as const));
  return Object.fromEntries(loaded);
}
