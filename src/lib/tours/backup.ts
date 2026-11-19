import { csvCell } from "@/lib/tours/ledger";

export type BackupItemDef = {
  id: string;
  label: string;
  hint: string;
  /** Heading the checkbox sits under, for a long list. */
  group?: string;
  /** Ticked when the page opens. Off for the big or personal ones. */
  defaultOn?: boolean;
};

/** What an operator can choose to save in a data backup. */
export const OPERATOR_BACKUP_ITEMS = [
  { id: "bookings", label: "Bookings", hint: "Guests, tour dates, status and amounts" },
  { id: "payments", label: "Payments", hint: "Every payment and refund recorded on your bookings" },
  { id: "packages", label: "Tour packages", hint: "Your packages and their details" },
  { id: "guides", label: "Guides", hint: "Your team and applicants, with pay terms" },
  { id: "merchandise", label: "Merchandise", hint: "Your merchandise listings" },
  { id: "reviews", label: "Reviews", hint: "Ratings, comments and your replies" },
] as const satisfies readonly BackupItemDef[];

/** What a guide can choose to save: their own work and pay. */
export const GUIDE_BACKUP_ITEMS = [
  { id: "tours", label: "Tours", hint: "Every tour you were assigned, with your fee and whether it was paid" },
  { id: "operators", label: "Operators", hint: "The operators you applied to or work with, and your share" },
  { id: "availability", label: "Availability", hint: "The days and hours you marked free or busy" },
  { id: "reviews", label: "Reviews", hint: "Ratings and comments about you" },
] as const satisfies readonly BackupItemDef[];

/** What the Tourism Office can choose to save: records across the whole system. */
export const ADMIN_BACKUP_ITEMS = [
  { id: "bookings", group: "Operations", label: "Bookings", hint: "Every booking, with guest contact details" },
  { id: "payments", group: "Operations", label: "Payments", hint: "Every payment and refund" },
  { id: "packages", group: "Operations", label: "Tour packages", hint: "All operators' packages and their review status" },
  { id: "operators", group: "People", label: "Operators", hint: "Operator records and accreditation (no bank or GCash details)" },
  { id: "guides", group: "People", label: "Guides", hint: "Guide records and accreditation" },
  { id: "accounts", group: "People", label: "Accounts and roles", hint: "Names, emails, roles and suspensions", defaultOn: false },
  { id: "attractions", group: "Content", label: "Places", hint: "Attractions and their pins" },
  { id: "events", group: "Content", label: "Events", hint: "The events calendar" },
  { id: "places", group: "Content", label: "Food and stays", hint: "Local guide places" },
  { id: "fares", group: "Content", label: "Fares", hint: "Fares and travel times" },
  { id: "merchandise", group: "Content", label: "Merchandise", hint: "The merchandise showcase" },
  { id: "emergency", group: "Content", label: "Emergency numbers", hint: "Emergency contacts" },
  { id: "reviews", group: "Moderation and audit", label: "Reviews", hint: "All reviews, including hidden ones" },
  { id: "reports", group: "Moderation and audit", label: "Reports", hint: "Reports and how they were resolved" },
  { id: "activity", group: "Moderation and audit", label: "Activity log", hint: "Every change and admin action (can be large)", defaultOn: false },
] as const satisfies readonly BackupItemDef[];

export type OperatorBackupItem = (typeof OPERATOR_BACKUP_ITEMS)[number]["id"];
export type GuideBackupItem = (typeof GUIDE_BACKUP_ITEMS)[number]["id"];
export type AdminBackupItem = (typeof ADMIN_BACKUP_ITEMS)[number]["id"];

export const BACKUP_FORMATS = [
  { id: "zip", label: "ZIP of CSV files (opens in Excel or Sheets)" },
  { id: "json", label: "One JSON file (for archiving or moving data)" },
] as const;
export type BackupFormat = (typeof BACKUP_FORMATS)[number]["id"];

/** The chosen items, in the order they are listed, with duplicates and unknown values dropped. */
export function parseBackupItems<Id extends string>(values: string[], defs: readonly { id: Id }[]): Id[] {
  const wanted = new Set(values.flatMap((v) => v.split(",")).map((v) => v.trim()));
  return defs.map((d) => d.id).filter((id) => wanted.has(id));
}

export function parseBackupFormat(value: string | null): BackupFormat {
  return value === "json" ? "json" : "zip";
}

export type BackupCell = string | number | boolean | null;
export type BackupColumn = { key: string; label: string };
export type BackupTable = { columns: BackupColumn[]; rows: Record<string, BackupCell>[] };
export type BackupTables = Record<string, BackupTable>;

/** CSV with a BOM so Excel reads UTF-8 (₱, ñ); cells that look like formulas are neutralised. */
export function tableToCsv(table: BackupTable): string {
  const header = table.columns.map((c) => csvCell(c.label)).join(",");
  const lines = table.rows.map((row) => table.columns.map((c) => csvCell(row[c.key])).join(","));
  return "﻿" + [header, ...lines].join("\r\n") + "\r\n";
}

export function tablesToJson(meta: { exportedAt: string; business: string }, tables: BackupTables): string {
  const data = Object.fromEntries(Object.entries(tables).map(([id, table]) => [id, table.rows]));
  return JSON.stringify({ exported_at: meta.exportedAt, business: meta.business, data }, null, 2);
}

export function backupFileStem(now: Date): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return `connect-daet-backup-${day}`;
}
