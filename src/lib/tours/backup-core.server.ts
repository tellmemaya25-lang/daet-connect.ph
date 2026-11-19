import "server-only";
import type { BackupCell, BackupColumn, BackupTable } from "@/lib/tours/backup";

const PAGE = 1000;
const MAX_ROWS = 50_000;

export type Row = Record<string, unknown>;
export const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const cell = (v: unknown): BackupCell => (v === undefined || v === null ? null : typeof v === "number" || typeof v === "boolean" ? v : String(v));
export const list = (v: unknown) => (Array.isArray(v) ? v.join("; ") : null);

/** Reads a query a thousand rows at a time (the API's own cap), up to a safety limit. */
export async function fetchAll(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error("backup query failed");
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < PAGE) break;
  }
  return rows;
}

export const table = (columns: BackupColumn[], rows: Row[]): BackupTable => ({
  columns,
  rows: rows.map((row) => Object.fromEntries(columns.map((c) => [c.key, cell(row[c.key])]))),
});

export const col = (key: string, label: string): BackupColumn => ({ key, label });
