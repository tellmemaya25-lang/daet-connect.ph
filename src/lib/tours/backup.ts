import { csvCell } from "@/lib/tours/ledger";

/** What an operator can choose to save in a data backup. */
export const BACKUP_ITEMS = [
  { id: "bookings", label: "Bookings", hint: "Guests, tour dates, status and amounts" },
  { id: "payments", label: "Payments", hint: "Every payment and refund recorded on your bookings" },
  { id: "packages", label: "Tour packages", hint: "Your packages and their details" },
  { id: "guides", label: "Guides", hint: "Your team and applicants, with pay terms" },
  { id: "merchandise", label: "Merchandise", hint: "Your merchandise listings" },
  { id: "reviews", label: "Reviews", hint: "Ratings, comments and your replies" },
] as const;

export type BackupItem = (typeof BACKUP_ITEMS)[number]["id"];

export const BACKUP_FORMATS = [
  { id: "zip", label: "ZIP of CSV files (opens in Excel or Sheets)" },
  { id: "json", label: "One JSON file (for archiving or moving data)" },
] as const;
export type BackupFormat = (typeof BACKUP_FORMATS)[number]["id"];

/** The chosen items, in the order they are listed, with duplicates and unknown values dropped. */
export function parseBackupItems(values: string[]): BackupItem[] {
  const wanted = new Set(values.flatMap((v) => v.split(",")).map((v) => v.trim()));
  return BACKUP_ITEMS.map((i) => i.id).filter((id) => wanted.has(id));
}

export function parseBackupFormat(value: string | null): BackupFormat {
  return value === "json" ? "json" : "zip";
}

export type BackupCell = string | number | boolean | null;
export type BackupColumn = { key: string; label: string };
export type BackupTable = { columns: BackupColumn[]; rows: Record<string, BackupCell>[] };

/** CSV with a BOM so Excel reads UTF-8 (₱, ñ); cells that look like formulas are neutralised. */
export function tableToCsv(table: BackupTable): string {
  const header = table.columns.map((c) => csvCell(c.label)).join(",");
  const lines = table.rows.map((row) => table.columns.map((c) => csvCell(row[c.key])).join(","));
  return "﻿" + [header, ...lines].join("\r\n") + "\r\n";
}

export function tablesToJson(meta: { exportedAt: string; business: string }, tables: Partial<Record<BackupItem, BackupTable>>): string {
  const data = Object.fromEntries(Object.entries(tables).map(([id, table]) => [id, table!.rows]));
  return JSON.stringify({ exported_at: meta.exportedAt, business: meta.business, data }, null, 2);
}

export function backupFileStem(now: Date): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return `connect-daet-backup-${day}`;
}
