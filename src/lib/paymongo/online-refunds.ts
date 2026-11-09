/**
 * Reconciling PayMongo refunds with the booking ledger, without network or
 * Supabase calls.
 *
 * PayMongo is the source of truth for money that has actually left. The app
 * used to call PayMongo first and write the ledger afterwards; if the ledger
 * write failed, a retry could send the same refund twice. These helpers let
 * the board read PayMongo's existing refunds first, record any that are
 * missing from the ledger, and only then ask PayMongo for new money.
 */

import { centavosToPesos } from "@/lib/paymongo/checkout";
import { isSettledRefundStatus, type RefundResource } from "@/lib/paymongo/refunds";

export type OnlinePaymentRow = {
  id: string;
  provider_ref: string | null;
  amount: number | string;
  payment_method?: string | null;
  provider_method?: string | null;
};

/** One PayMongo refund that the ledger should have, but does not. */
export type RefundLine = {
  /** The ledger row that received the original payment. */
  payment_id: string;
  /** PayMongo's refund id (ref_…). */
  provider_ref: string;
  /** Pesos, from PayMongo's own echo of the amount. */
  amount: number;
  /** The PayMongo payment id (pay_…) this refund came from. */
  original_payment_ref: string;
};

/** A refunded tours_payments row. `refund_of` may be absent on older schemas. */
export type LedgerRefundRow = {
  refund_of?: string | null;
  raw_event?: unknown;
  amount: number | string;
  payment_status?: string | null;
  provider_ref?: string | null;
};

const LEDGER_METHODS = ["cash", "gcash", "bank_transfer", "credit_card", "debit_card", "paypal", "other"] as const;
type LedgerMethod = (typeof LEDGER_METHODS)[number];

function roundMoney(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function ledgerMethod(payment: OnlinePaymentRow | undefined): LedgerMethod {
  const method = payment?.payment_method;
  if (typeof method === "string" && (LEDGER_METHODS as readonly string[]).includes(method)) return method as LedgerMethod;
  // PayMongo's exact wallet names are not all valid in tours_payments; keep
  // the constrained ledger column happy and preserve the original in
  // provider_method.
  if (payment?.provider_method === "card") return "credit_card";
  return "other";
}

/** Refunds that represent money actually on its way back to the tourist. */
export function settledPaymongoRefunds(refunds: RefundResource[], mode: "test" | "live"): RefundResource[] {
  return refunds.filter((refund) => {
    const attributes = refund?.attributes;
    if (!refund?.id || !attributes || typeof attributes.amount !== "number" || attributes.amount <= 0) return false;
    if (!isSettledRefundStatus(attributes.status)) return false;
    // The secret key already scopes the request; this is a belt-and-braces
    // guard for responses that carry the flag.
    if (typeof attributes.livemode === "boolean" && attributes.livemode !== (mode === "live")) return false;
    return true;
  });
}

/**
 * Turns PayMongo refunds into ledger lines. Refunds already recorded, failed
 * refunds, duplicate deliveries and refunds for other payments are ignored.
 */
export function refundLinesFromPaymongo({
  refunds,
  paymentRows,
  knownRefs,
  mode,
}: {
  refunds: RefundResource[];
  paymentRows: OnlinePaymentRow[];
  knownRefs: Set<string>;
  mode: "test" | "live";
}): RefundLine[] {
  const byProviderRef = new Map<string, OnlinePaymentRow>();
  for (const payment of paymentRows) {
    if (payment.provider_ref) byProviderRef.set(payment.provider_ref, payment);
  }
  const seen = new Set<string>();
  const lines: RefundLine[] = [];
  for (const refund of settledPaymongoRefunds(refunds, mode)) {
    const providerRef = refund.id;
    if (seen.has(providerRef) || knownRefs.has(providerRef)) continue;
    if (!/^ref_[A-Za-z0-9_-]+$/.test(providerRef)) continue;
    const payment = byProviderRef.get(refund.attributes.payment_id);
    if (!payment) continue;
    const amount = roundMoney(centavosToPesos(refund.attributes.amount));
    if (amount <= 0) continue;
    seen.add(providerRef);
    lines.push({
      payment_id: payment.id,
      provider_ref: providerRef,
      amount,
      original_payment_ref: refund.attributes.payment_id,
    });
  }
  return lines;
}

/**
 * How much of each completed PayMongo payment has already been refunded.
 *
 * Newer schemas link a refund row with `refund_of`. The no-migration fallback
 * stores the same link in `raw_event`, so both are understood here.
 */
export function refundedByPaymentFromLedger(rows: LedgerRefundRow[], paymentRows: OnlinePaymentRow[]): Map<string, number> {
  const byId = new Map(paymentRows.map((payment) => [payment.id, payment.id]));
  const byProviderRef = new Map<string, string>();
  for (const payment of paymentRows) {
    if (payment.provider_ref) byProviderRef.set(payment.provider_ref, payment.id);
  }
  const result = new Map<string, number>();
  for (const row of rows) {
    if (row.payment_status && row.payment_status !== "refunded") continue;
    const amount = Number(row.amount ?? 0);
    if (!(amount > 0)) continue;
    let paymentId = row.refund_of && byId.has(row.refund_of) ? row.refund_of : null;
    if (!paymentId) {
      const raw = asRecord(row.raw_event);
      const candidate = raw?.payment_id ?? raw?.original_payment_ref ?? raw?.ledger_payment_id;
      if (typeof candidate === "string") {
        paymentId = byId.has(candidate) ? candidate : (byProviderRef.get(candidate) ?? null);
      }
    }
    if (!paymentId) continue;
    result.set(paymentId, roundMoney((result.get(paymentId) ?? 0) + amount));
  }
  return result;
}

/** The JSONB shape the `tours_record_online_refund` RPC expects. */
export function rpcRefundRows(lines: RefundLine[]): Array<{ payment_id: string; provider_ref: string; amount: number }> {
  return lines.map(({ payment_id, provider_ref, amount }) => ({ payment_id, provider_ref, amount }));
}

/**
 * Ledger rows for the fallback write used when the RPC has not been applied.
 * The service-role client bypasses RLS, so the caller must have already
 * checked the signed-in operator and booking ownership.
 */
export function ledgerRowsForRefundLines({
  lines,
  paymentRows,
  bookingId,
  userId,
  now,
}: {
  lines: RefundLine[];
  paymentRows: OnlinePaymentRow[];
  bookingId: string;
  userId: string | null;
  now: string;
}): Array<Record<string, unknown>> {
  const byId = new Map(paymentRows.map((payment) => [payment.id, payment]));
  return lines.map((line) => {
    const payment = byId.get(line.payment_id);
    return {
      booking_id: bookingId,
      amount: line.amount,
      payment_method: ledgerMethod(payment),
      payment_status: "refunded",
      provider: "paymongo",
      provider_ref: line.provider_ref,
      provider_method: payment?.provider_method ?? null,
      reference_number: line.provider_ref,
      payment_date: now,
      notes: `Refund via PayMongo for payment ${line.original_payment_ref}`,
      recorded_by: userId,
      // The fallback schema has no refund_of column; this keeps the link to
      // the original payment so later refunds still see its remaining room.
      raw_event: {
        source: "operator_online_refund",
        payment_id: line.original_payment_ref,
        ledger_payment_id: line.payment_id,
        refund_id: line.provider_ref,
      },
    };
  });
}

/** A stable key so a retried create cannot create a second PayMongo refund. */
export function idempotencyKeyForRefund({
  bookingId,
  paymentId,
  sequence,
  amountCentavos,
  reason,
}: {
  bookingId: string;
  paymentId: string;
  sequence: number;
  amountCentavos: number;
  reason: string;
}): string {
  return `refund:${bookingId}:${paymentId}:${sequence}:${amountCentavos}:${reason}`.slice(0, 255);
}

/** How many settled refunds PayMongo already has for this payment. */
export function refundSequence(refunds: RefundResource[], paymentId: string, mode: "test" | "live"): number {
  return settledPaymongoRefunds(refunds, mode).filter((refund) => refund.attributes.payment_id === paymentId).length;
}

/** Pesos in a set of refund lines. */
export function sumRefundLines(lines: RefundLine[]): number {
  return roundMoney(lines.reduce((sum, line) => sum + line.amount, 0));
}

/** PayMongo refund ids, for an operator who has to reconcile by hand. */
export function refundReferences(lines: RefundLine[]): string {
  return lines.map((line) => line.provider_ref).join(", ");
}
