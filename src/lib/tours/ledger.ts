import { manilaDayStartUtc, monthKey, shiftMonth, type CalendarMonth } from "@/lib/tours/events-calendar";

/** Operator payments ledger: monthly totals and CSV export. */

export type LedgerRow = {
  id: string;
  amount: number | string;
  payment_method: string;
  provider: string | null;
  provider_method: string | null;
  payment_status: string;
  reference_number: string | null;
  payment_date: string | null;
  notes: string | null;
  booking_reference: string;
  tourist_name: string;
  package_title: string;
};

export type LedgerSummary = {
  received: number;
  refunded: number;
  count: number;
  online: number;
  manual: number;
  byMethod: Array<{ method: string; amount: number }>;
  byPackage: Array<{ title: string; amount: number; count: number }>;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Display label for how a ledger row was paid. */
export function ledgerMethodLabel(row: Pick<LedgerRow, "provider" | "provider_method" | "payment_method">): string {
  const method = row.provider === "paymongo" ? (row.provider_method ?? row.payment_method) : row.payment_method;
  const labels: Record<string, string> = {
    gcash: "GCash",
    paymaya: "Maya",
    card: "Card",
    credit_card: "Card",
    debit_card: "Card",
    grab_pay: "GrabPay",
    qrph: "QR Ph",
    dob: "Online banking",
    online_banking: "Online banking",
    bank_transfer: "Bank transfer",
    cash: "Cash",
    paypal: "PayPal",
    other: "Other",
  };
  return labels[method] ?? method;
}

export function summarizeLedger(rows: LedgerRow[]): LedgerSummary {
  let received = 0;
  let refunded = 0;
  let online = 0;
  let manual = 0;
  const byMethod = new Map<string, number>();
  const byPackage = new Map<string, { amount: number; count: number }>();

  for (const row of rows) {
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) continue;
    if (row.payment_status === "refunded") {
      refunded += amount;
      continue;
    }
    if (row.payment_status !== "completed") continue;
    received += amount;
    if (row.provider === "paymongo") online += amount;
    else manual += amount;
    const label = ledgerMethodLabel(row);
    byMethod.set(label, (byMethod.get(label) ?? 0) + amount);
    const title = row.package_title || "Other";
    const pkg = byPackage.get(title) ?? { amount: 0, count: 0 };
    pkg.amount += amount;
    pkg.count += 1;
    byPackage.set(title, pkg);
  }

  return {
    received: round2(received),
    refunded: round2(refunded),
    count: rows.filter((row) => row.payment_status === "completed").length,
    online: round2(online),
    manual: round2(manual),
    byMethod: [...byMethod.entries()]
      .map(([method, amount]) => ({ method, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount),
    byPackage: [...byPackage.entries()]
      .map(([title, entry]) => ({ title, amount: round2(entry.amount), count: entry.count }))
      .sort((a, b) => b.amount - a.amount),
  };
}

/** UTC range [start, end) of a Manila calendar month, for filtering payment_date. */
export function monthRangeUtc(month: CalendarMonth): { startIso: string; endIso: string } {
  const next = shiftMonth(month, 1);
  return {
    startIso: manilaDayStartUtc(`${monthKey(month)}-01`).toISOString(),
    endIso: manilaDayStartUtc(`${monthKey(next)}-01`).toISOString(),
  };
}

/**
 * CSV cell: quotes when needed and neutralizes spreadsheet formulas, since
 * reference numbers and names come from user input.
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function ledgerToCsv(rows: LedgerRow[]): string {
  const header = ["Date (Manila)", "Booking", "Tourist", "Package", "Method", "Channel", "Reference", "Status", "Amount (PHP)", "Notes"];
  const dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" });
  const lines = rows.map((row) =>
    [
      row.payment_date ? dateFormat.format(new Date(row.payment_date)) : "",
      row.booking_reference,
      row.tourist_name,
      row.package_title,
      ledgerMethodLabel(row),
      row.provider === "paymongo" ? "PayMongo" : "Manual",
      row.reference_number ?? "",
      row.payment_status,
      Number(row.amount).toFixed(2),
      row.notes ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  // BOM so Excel opens UTF-8 (₱, ñ) correctly.
  return "﻿" + [header.join(","), ...lines].join("\r\n") + "\r\n";
}
