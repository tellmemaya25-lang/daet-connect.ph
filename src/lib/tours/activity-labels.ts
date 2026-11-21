import type { ActivityEntry } from "@/lib/tours/admin-moderation";
import { isUuid } from "@/lib/tours/operator-access";

/** Tables whose rows the activity log can name for an admin. */
export type LabelTable = "tours_bookings" | "tours_payments" | "tours_packages" | "profiles";
export type LabelRef = { table: LabelTable; id: string };

const ADMIN_TYPE_TABLE: Record<string, LabelTable> = { user: "profiles", profile: "profiles", booking: "tours_bookings", package: "tours_packages", payment: "tours_payments" };

/** The record an entry is about, when it is one we can name. Admin actions store "type:uuid". */
export function entryRef(e: Pick<ActivityEntry, "entity" | "entityId">): LabelRef | null {
  if (!e.entityId) return null;
  if (e.entity === "admin_action") {
    const [type, id] = e.entityId.split(":");
    const table = ADMIN_TYPE_TABLE[type ?? ""];
    return table && isUuid(id ?? "") ? { table, id: id as string } : null;
  }
  const table = (["tours_bookings", "tours_payments", "tours_packages", "profiles"] as const).find((t) => t === e.entity);
  return table && isUuid(e.entityId) ? { table, id: e.entityId } : null;
}

/**
 * Who made the change. The database records no account when a server process
 * wrote the row (auth.uid() is null, role "system"), but payments keep who
 * recorded them in their own columns, so use that before saying "System".
 */
export function entryActorId(e: Pick<ActivityEntry, "actorId" | "changes">): string | null {
  if (e.actorId) return e.actorId;
  const by = e.changes.recorded_by;
  return typeof by === "string" && isUuid(by) ? by : null;
}

/** Every profile id an entry list needs a name for, grouped by table. */
export function collectRefs(rows: ActivityEntry[]): Record<LabelTable, string[]> {
  const sets: Record<LabelTable, Set<string>> = { tours_bookings: new Set(), tours_payments: new Set(), tours_packages: new Set(), profiles: new Set() };
  for (const r of rows) {
    const ref = entryRef(r);
    if (ref) sets[ref.table].add(ref.id);
    const by = entryActorId(r);
    if (by && !r.actorId) sets.profiles.add(by);
  }
  return { tours_bookings: [...sets.tours_bookings], tours_payments: [...sets.tours_payments], tours_packages: [...sets.tours_packages], profiles: [...sets.profiles] };
}

const peso = (n: unknown) => (typeof n === "number" ? `₱${n.toLocaleString("en-PH")}` : null);

/** A human label for one looked-up row, e.g. "Booking DC-1042 · Ana Cruz". */
export function rowLabel(table: LabelTable, row: Record<string, unknown>): string | null {
  const s = (k: string) => (typeof row[k] === "string" && (row[k] as string).trim() ? (row[k] as string).trim() : null);
  if (table === "tours_bookings") {
    const ref = s("booking_reference");
    const who = s("contact_name");
    return ref ? `Booking ${ref}${who ? ` · ${who}` : ""}` : who ? `Booking for ${who}` : null;
  }
  if (table === "tours_packages") return s("title");
  if (table === "profiles") return s("full_name");
  const amount = peso(row.amount);
  return amount ? `${amount} payment` : null;
}

/** "ab12cd34" — enough to tell two records apart in a tooltip, never shown as the main text. */
export const shortId = (id: string) => id.replace(/-/g, "").slice(0, 8);
