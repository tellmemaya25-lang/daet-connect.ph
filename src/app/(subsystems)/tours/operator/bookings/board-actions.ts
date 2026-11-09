"use server";

/**
 * The bookings board's two money-and-people flows, in one place:
 *
 *   approveBooking        confirm a request and (optionally) name its guide in
 *                         the same update, then email the voucher.
 *   approvePendingBookings the same thing for the rows ticked in the list.
 *   processRefund         send money back through PayMongo, or record a manual
 *                         refund, on a booking that is already closed.
 */

import { emailBookingConfirmed, emailGuideAssigned, emailRefundSent } from "@/lib/email/notify-booking";
import { formatPeso } from "@/lib/money";
import { centavosToPesos } from "@/lib/paymongo/checkout";
import { createRefund, getPaymongoConfig, listRefunds, type PaymongoConfig } from "@/lib/paymongo/client";
import {
  idempotencyKeyForRefund,
  ledgerRowsForRefundLines,
  refundedByPaymentFromLedger,
  refundLinesFromPaymongo,
  refundReferences,
  refundSequence,
  rpcRefundRows,
  sumRefundLines,
  type LedgerRefundRow,
  type OnlinePaymentRow,
  type RefundLine,
} from "@/lib/paymongo/online-refunds";
import {
  isRefundReason,
  planRefund,
  REFUND_NOTES_MAX,
  REFUND_REASONS,
  refundNotes,
  type OnlinePayment,
  type RefundResource,
} from "@/lib/paymongo/refunds";
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkTransition, isBookingStatus } from "@/lib/tours/booking-lifecycle";
import { parseRefundForm } from "@/lib/tours/cancellation";
import { userFacingDbError } from "@/lib/tours/db-errors";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { isUuid } from "@/lib/tours/operator-access";
import { capacityCheck } from "@/lib/tours/booking-board";

export type BoardActionResult = { success: boolean; message?: string; error?: string };

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type Admin = ReturnType<typeof createSupabaseAdminClient>;
type PaymentRow = OnlinePaymentRow & { provider: string; payment_status: string };

const roundMoney = (value: number): number => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

function revalidateBookings(bookingId?: string) {
  revalidatePath("/tours/operator/bookings");
  revalidatePath("/tours/operator/payments");
  if (bookingId) revalidatePath(`/tours/bookings/${bookingId}`);
}

/** The signed-in person's approved operator row, or the message to show. */
async function requireOperator(
  supabase: Supabase,
): Promise<{ ok: true; operatorId: string; userId: string } | { ok: false; error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to manage bookings." };
  const { data: operator } = await supabase
    .from("tours_operators")
    .select("id, accreditation_status")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!operator) return { ok: false, error: "Operator profile not found." };
  if (operator.accreditation_status !== "approved") {
    return { ok: false, error: "Your operator account must be approved to manage bookings." };
  }
  return { ok: true, operatorId: operator.id, userId: user.id };
}

/** Turns "not the operator" into the board's own result shape. */
const asResult = (failure: { error: string }): BoardActionResult => ({ success: false, error: failure.error });

type BookingForBoard = {
  id: string;
  status: string;
  tour_date: string;
  number_of_pax: number;
  total_amount: number | string;
  total_paid: number | string | null;
  booking_reference: string;
  contact_name: string | null;
  contact_phone: string | null;
  special_requests: string | null;
  assigned_guide_id: string | null;
  package_id: string;
  tours_packages: { operator_id: string } | Array<{ operator_id: string }> | null;
};

async function loadOwnBooking(supabase: Supabase, bookingId: string, operatorId: string) {
  const { data, error } = await supabase
    .from("tours_bookings")
    .select(
      "id, status, tour_date, number_of_pax, total_amount, total_paid, booking_reference, contact_name, contact_phone, special_requests, assigned_guide_id, package_id, tours_packages!inner ( operator_id )",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as BookingForBoard;
  const pkg = Array.isArray(row.tours_packages) ? row.tours_packages[0] : row.tours_packages;
  if (pkg?.operator_id !== operatorId) return null;
  return row;
}

/**
 * Approves one pending request: the status change and the guide go in one
 * update, so the booking never reads as "confirmed, nobody to lead it" and
 * the schedule guard in the database checks the guide against this date.
 */
export async function approveBooking(
  bookingId: string,
  guideId: string | null = null,
): Promise<BoardActionResult> {
  if (!isUuid(bookingId) || (guideId && !isUuid(guideId))) {
    return { success: false, error: "Booking not found." };
  }
  const supabase = await createSupabaseServerClient();
  const operator = await requireOperator(supabase);
  if (!operator.ok) return asResult(operator);

  const booking = await loadOwnBooking(supabase, bookingId, operator.operatorId);
  if (!booking) return { success: false, error: "Booking not found." };
  if (!isBookingStatus(booking.status)) return { success: false, error: "This booking cannot be approved." };

  const check = checkTransition(booking.status, "confirmed", "operator", {
    tourDate: booking.tour_date,
    today: toManilaDateKey(new Date()),
    totalPaid: Number(booking.total_paid ?? 0),
  });
  if (!check.ok) return { success: false, error: check.reason };

  // What the dialog shows before confirming is checked again here: a seat
  // could have gone while the dialog was open.
  const { data: slot } = await supabase
    .from("tours_package_availability")
    .select("capacity_total, capacity_booked")
    .eq("package_id", booking.package_id)
    .eq("available_date", booking.tour_date)
    .maybeSingle();
  const capacity = capacityCheck({ tourDate: booking.tour_date, pax: booking.number_of_pax, capacity: slot ?? null });
  if (!capacity.ok) return { success: false, error: capacity.text };

  if (guideId) {
    const { data: guide } = await supabase
      .from("tours_guides")
      .select("id, accreditation_status")
      .eq("id", guideId)
      .maybeSingle();
    if (!guide) return { success: false, error: "That guide was not found." };
    if (guide.accreditation_status !== "approved") return { success: false, error: "That guide is not accredited yet." };
  }

  const { error } = await supabase
    .from("tours_bookings")
    .update({ status: "confirmed", ...(guideId ? { assigned_guide_id: guideId } : {}) })
    .eq("id", bookingId);
  if (error) {
    console.error("Approve booking error:", error);
    return { success: false, error: userFacingDbError(error, "The booking could not be approved.") };
  }

  revalidateBookings(bookingId);
  emailBookingConfirmed(bookingId);
  if (guideId) emailGuideAssigned(bookingId, guideId);

  const name = guideId ? await guideFirstName(supabase, guideId) : null;
  return {
    success: true,
    message: name
      ? `Booking ${booking.booking_reference} confirmed with guide ${name}!`
      : `Booking ${booking.booking_reference} confirmed.`,
  };
}

async function guideFirstName(supabase: Supabase, guideId: string): Promise<string | null> {
  const { data: guide } = await supabase.from("tours_guides").select("profile_id").eq("id", guideId).maybeSingle();
  if (!guide?.profile_id) return null;
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", guide.profile_id).maybeSingle();
  const full = profile?.full_name?.trim();
  return full ? full.split(/\s+/)[0] : null;
}

/** Declines one pending request. The reason is shown to the tourist. */
export async function declineBooking(bookingId: string, reason: string): Promise<BoardActionResult> {
  if (!isUuid(bookingId)) return { success: false, error: "Booking not found." };
  const supabase = await createSupabaseServerClient();
  const operator = await requireOperator(supabase);
  if (!operator.ok) return asResult(operator);
  const booking = await loadOwnBooking(supabase, bookingId, operator.operatorId);
  if (!booking) return { success: false, error: "Booking not found." };

  const trimmed = String(reason ?? "").trim();
  if (trimmed.length < 5) return { success: false, error: "Tell the tourist why (at least 5 characters)." };
  if (trimmed.length > 500) return { success: false, error: "Reason must be 500 characters or fewer." };

  const { error } = await supabase
    .from("tours_bookings")
    .update({ status: "rejected", cancellation_reason: trimmed })
    .eq("id", bookingId);
  if (error) return { success: false, error: userFacingDbError(error, "The booking could not be declined.") };

  revalidateBookings(bookingId);
  return { success: true, message: `Booking ${booking.booking_reference} marked as declined.` };
}

/**
 * Cancels a live booking without returning money (the tourist agreed, or
 * nothing was paid). Refunds go through processRefund, which closes the
 * booking itself so money and status never disagree.
 */
export async function cancelBooking(bookingId: string, reason: string): Promise<BoardActionResult> {
  if (!isUuid(bookingId)) return { success: false, error: "Booking not found." };
  const supabase = await createSupabaseServerClient();
  const operator = await requireOperator(supabase);
  if (!operator.ok) return asResult(operator);
  const booking = await loadOwnBooking(supabase, bookingId, operator.operatorId);
  if (!booking) return { success: false, error: "Booking not found." };

  const trimmed = String(reason ?? "").trim();
  if (trimmed.length < 5) return { success: false, error: "Tell the tourist why (at least 5 characters)." };
  if (trimmed.length > 500) return { success: false, error: "Reason must be 500 characters or fewer." };

  if (!isBookingStatus(booking.status)) return { success: false, error: "This booking cannot be cancelled." };
  const check = checkTransition(booking.status, "cancelled", "operator", {
    tourDate: booking.tour_date,
    today: toManilaDateKey(new Date()),
    totalPaid: Number(booking.total_paid ?? 0),
  });
  if (!check.ok) return { success: false, error: check.reason };

  const { error } = await supabase
    .from("tours_bookings")
    .update({ status: "cancelled", cancellation_reason: trimmed })
    .eq("id", bookingId);
  if (error) return { success: false, error: userFacingDbError(error, "The booking could not be cancelled.") };

  revalidateBookings(bookingId);
  return { success: true, message: `Booking ${booking.booking_reference} cancelled.` };
}

/** Approves the ticked rows, keeping going when one of them fails. */
export async function approvePendingBookings(bookingIds: string[]): Promise<BoardActionResult> {
  const ids = [...new Set(bookingIds.filter((id) => isUuid(id)))].slice(0, 50);
  if (ids.length === 0) return { success: false, error: "Tick at least one booking to approve." };

  let approved = 0;
  const failures: string[] = [];
  for (const id of ids) {
    const result = await approveBooking(id, null);
    if (result.success) approved += 1;
    else failures.push(result.error ?? "One booking could not be approved.");
  }
  if (approved === 0) return { success: false, error: failures[0] ?? "Nothing could be approved." };
  return {
    success: true,
    message: `${approved} booking${approved === 1 ? "" : "s"} confirmed.${failures.length ? ` ${failures.length} could not be: ${failures[0]}` : ""}`,
  };
}

type RefundState = {
  refundable: number;
  refundedByPayment: Map<string, number>;
  knownRefs: Set<string>;
};

/** Refunds already in the ledger, plus what the booking can still return. */
async function loadRefundState(supabase: Supabase, bookingId: string, paymentRows: PaymentRow[]): Promise<RefundState> {
  // select("*"), not refund_of: the production schema may not have that column
  // yet. raw_event carries the same link after the fallback ledger write.
  const { data: refundRows } = await supabase
    .from("tours_payments")
    .select("*")
    .eq("booking_id", bookingId)
    .eq("payment_status", "refunded");
  const { data: refundableRow } = await supabase.rpc("tours_refundable_amount", { p_booking_id: bookingId });
  const rows = (refundRows ?? []) as LedgerRefundRow[];
  return {
    refundable: roundMoney(Number(refundableRow ?? 0)),
    refundedByPayment: refundedByPaymentFromLedger(rows, paymentRows),
    knownRefs: new Set(rows.map((row) => row.provider_ref).filter((ref): ref is string => Boolean(ref))),
  };
}

/** PostgREST's "this RPC has not been applied" error, in its two shapes. */
function isMissingOnlineRefundRpc(error: unknown): boolean {
  const dbError = error as { code?: string | null; message?: string | null } | null;
  const code = String(dbError?.code ?? "").toUpperCase();
  const message = String(dbError?.message ?? "");
  return (
    code === "PGRST202" ||
    code === "42883" ||
    /could not find the function/i.test(message) ||
    /function .* does not exist/i.test(message)
  );
}

type RecordRefundResult = { ok: true; remaining: number } | { ok: false; reason: string };

/**
 * Writes one ledger row per PayMongo refund. The preferred path is the
 * database RPC, which re-checks the per-payment ceiling. If that migration
 * has not been applied, a server-only service-role upsert writes the same
 * rows: requireOperator and loadOwnBooking have already authorised the call,
 * and the unique (provider, provider_ref) index makes replays harmless.
 */
async function recordOnlineRefundRows({
  supabase,
  bookingId,
  userId,
  paymentRows,
  lines,
}: {
  supabase: Supabase;
  bookingId: string;
  userId: string;
  paymentRows: PaymentRow[];
  lines: RefundLine[];
}): Promise<RecordRefundResult> {
  if (lines.length === 0) {
    const state = await loadRefundState(supabase, bookingId, paymentRows);
    return { ok: true, remaining: state.refundable };
  }

  const { data: left, error } = await supabase.rpc("tours_record_online_refund", {
    p_booking_id: bookingId,
    p_rows: rpcRefundRows(lines),
  });
  if (!error) return { ok: true, remaining: roundMoney(Number(left ?? 0)) };
  if (!isMissingOnlineRefundRpc(error)) {
    console.error("Record online refund error:", error);
    return { ok: false, reason: userFacingDbError(error, "the refund ledger rejected the write") };
  }

  let admin: Admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    console.error("Service-role client unavailable for refund fallback:", error);
    return { ok: false, reason: "the server's Supabase admin key is missing" };
  }
  const now = new Date().toISOString();
  const rows = ledgerRowsForRefundLines({ lines, paymentRows, bookingId, userId, now });
  const { error: insertError } = await admin
    .from("tours_payments")
    .upsert(rows, { onConflict: "provider,provider_ref", ignoreDuplicates: true });
  if (insertError) {
    console.error("Fallback refund ledger error:", insertError);
    return { ok: false, reason: userFacingDbError(insertError, "the fallback ledger write failed") };
  }

  const { data: refundableRow } = await admin.rpc("tours_refundable_amount", { p_booking_id: bookingId });
  const remaining = roundMoney(Number(refundableRow ?? 0));
  if (remaining <= 0) {
    await admin
      .from("tours_cancellations")
      .update({ status: "refund_confirmed", resolved_at: now })
      .eq("booking_id", bookingId)
      .eq("status", "approved");
  }
  return { ok: true, remaining };
}

/** Every refund PayMongo already knows about, for this booking's payments. */
async function paymongoRefundsForPayments(config: PaymongoConfig, paymentRows: PaymentRow[]): Promise<RefundResource[]> {
  const paymentIds = [...new Set(paymentRows.map((row) => row.provider_ref).filter((ref): ref is string => Boolean(ref)))];
  const lists = await Promise.all(paymentIds.map((paymentId) => listRefunds(config, paymentId)));
  return lists.flat();
}

/** What each completed online payment still has left, after ledger refunds. */
function onlineRoom(paymentRows: PaymentRow[], refundedByPayment: Map<string, number>): number {
  return roundMoney(
    paymentRows
      .filter((row) => row.provider_ref)
      .reduce((sum, row) => sum + Math.max(0, roundMoney(Number(row.amount ?? 0) - (refundedByPayment.get(row.id) ?? 0))), 0),
  );
}

/**
 * Process Refund, from the board.
 *
 * PayMongo (Auto): the app first reconciles refunds PayMongo already sent
 * into the ledger, then refunds what is left (oldest payment first, never past
 * what each still has) and records one ledger row per refund. A failed ledger
 * write never asks the operator to "try again" into a second refund.
 * Manual GCash: the operator has sent the money themselves and is recording it.
 *
 * A booking that is still live is cancelled or declined first, because money
 * only comes back once the tour is off.
 */
export async function processRefund(input: {
  bookingId: string;
  method: "paymongo" | "manual";
  /** Pesos. Defaults to everything the tourist can still get back. */
  amount?: number | null;
  reason?: string;
  /** For a manual refund: the wallet or bank the money went to, and its reference. */
  manualMethod?: string;
  reference?: string | null;
  closeAs?: "cancelled" | "rejected" | null;
  closeReason?: string | null;
}): Promise<BoardActionResult> {
  if (!isUuid(input.bookingId)) return { success: false, error: "Booking not found." };
  if (input.method !== "paymongo" && input.method !== "manual") return { success: false, error: "Choose how to refund." };
  const reasonKey = isRefundReason(input.reason) ? input.reason : "guest";
  const reasonLabel = REFUND_REASONS[reasonKey].label;

  const supabase = await createSupabaseServerClient();
  const operator = await requireOperator(supabase);
  if (!operator.ok) return asResult(operator);
  const booking = await loadOwnBooking(supabase, input.bookingId, operator.operatorId);
  if (!booking) return { success: false, error: "Booking not found." };

  // Money only goes back once the tour is off. A live booking is closed here,
  // in the same step, so the operator does not have to cancel and then refund.
  if (booking.status === "pending" || booking.status === "confirmed") {
    const nextStatus = input.closeAs === "rejected" && booking.status === "pending" ? "rejected" : "cancelled";
    const check = checkTransition(booking.status, nextStatus, "operator", {
      tourDate: booking.tour_date,
      today: toManilaDateKey(new Date()),
      totalPaid: Number(booking.total_paid ?? 0),
    });
    if (!check.ok) return { success: false, error: check.reason };
    const trimmed = String(input.closeReason ?? "").trim();
    const closeReason = trimmed.length >= 5 ? trimmed.slice(0, 500) : `Refunded before the tour: ${reasonLabel}.`;
    const { error } = await supabase
      .from("tours_bookings")
      .update({ status: nextStatus, cancellation_reason: closeReason })
      .eq("id", booking.id);
    if (error) return { success: false, error: userFacingDbError(error, "The booking could not be closed for the refund.") };
  } else if (booking.status !== "cancelled" && booking.status !== "rejected") {
    return { success: false, error: "This booking has already been completed; refund it from the ledger instead." };
  }

  if (input.method === "manual") {
    const formData = new FormData();
    formData.set("amount", input.amount != null ? input.amount.toFixed(2) : "");
    formData.set("method", input.manualMethod ?? "gcash");
    formData.set("reference", input.reference ?? "");
    const { data: refundable } = await supabase.rpc("tours_refundable_amount", { p_booking_id: booking.id });
    const available = Number(refundable ?? 0);
    if (input.amount == null) formData.set("amount", available.toFixed(2));
    const parsed = parseRefundForm(formData, available);
    if (!parsed.ok) return { success: false, error: parsed.error };
    const { data: left, error } = await supabase.rpc("tours_record_refund", {
      p_booking_id: booking.id,
      p_amount: parsed.data.amount,
      p_method: parsed.data.method,
      p_reference: parsed.data.reference ?? "",
    });
    if (error) {
      console.error("Record refund error:", error);
      return { success: false, error: userFacingDbError(error, "The refund could not be recorded.") };
    }
    revalidateBookings(booking.id);
    emailRefundSent(booking.id, parsed.data.amount);
    const remaining = Number(left ?? 0);
    return {
      success: true,
      message:
        remaining > 0
          ? `Refund of ${formatPeso(parsed.data.amount)} recorded. ${formatPeso(remaining)} can still be refunded.`
          : `Refund of ${formatPeso(parsed.data.amount)} recorded. Everything paid has been returned.`,
    };
  }

  // ---- PayMongo ----------------------------------------------------------
  const config = getPaymongoConfig();
  if (!config) return { success: false, error: "PayMongo is not configured, so an automatic refund cannot be sent. Use Manual GCash." };
  const channel = config.mode === "live" ? "PayMongo" : "PayMongo Sandbox";

  const { data: paymentRows, error: paymentsError } = await supabase
    .from("tours_payments")
    .select("id, provider, provider_ref, amount, payment_status, payment_method, provider_method")
    .eq("booking_id", booking.id)
    .eq("provider", "paymongo")
    .eq("payment_status", "completed")
    .order("payment_date", { ascending: true });
  if (paymentsError) return { success: false, error: "The payments on this booking could not be read." };
  if (!paymentRows || paymentRows.length === 0) {
    return { success: false, error: "Nothing was paid online on this booking. Use Manual GCash to record what you sent back." };
  }
  const payments = paymentRows as PaymentRow[];
  let state = await loadRefundState(supabase, booking.id, payments);
  if (state.refundable <= 0) {
    return { success: true, message: `${channel}: everything paid has already been returned. No money was sent.` };
  }

  // PayMongo is the source of truth for money already sent. An earlier click
  // can have accepted a refund even when our ledger write failed, so look
  // before creating anything new.
  let paymongoRefunds: RefundResource[];
  try {
    paymongoRefunds = await paymongoRefundsForPayments(config, payments);
  } catch (error) {
    console.error("Could not list PayMongo refunds:", error);
    return {
      success: false,
      error: `${channel} could not be checked for refunds already sent, so no money was sent. Check the PayMongo connection and try again.`,
    };
  }

  const missingLines = refundLinesFromPaymongo({
    refunds: paymongoRefunds,
    paymentRows: payments,
    knownRefs: state.knownRefs,
    mode: config.mode,
  });
  const missingAmount = sumRefundLines(missingLines);
  const recordable = Math.min(state.refundable, onlineRoom(payments, state.refundedByPayment));
  if (missingAmount > recordable + 0.001) {
    return {
      success: false,
      error: `${channel} shows ${formatPeso(missingAmount)} in refunds that are not in the ledger, but only ${formatPeso(recordable)} was paid online. No money was sent. Ask an admin to reconcile these references: ${refundReferences(missingLines)}.`,
    };
  }

  if (missingLines.length > 0) {
    const reconciled = await recordOnlineRefundRows({
      supabase,
      bookingId: booking.id,
      userId: operator.userId,
      paymentRows: payments,
      lines: missingLines,
    });
    if (!reconciled.ok) {
      return {
        success: false,
        error: `${channel} had already sent ${formatPeso(missingAmount)}, but the ledger could not be updated (${reconciled.reason}). Do not send another refund; ask an admin to record these references by hand: ${refundReferences(missingLines)}.`,
      };
    }
    revalidateBookings(booking.id);
    state = await loadRefundState(supabase, booking.id, payments);
    if (state.refundable <= 0) {
      return {
        success: true,
        message: `${channel}: ${formatPeso(missingAmount)} had already been sent by PayMongo. The ledger is now up to date; no money was sent again. Everything paid has been returned.`,
      };
    }
  }

  const online: OnlinePayment[] = payments
    .filter((row) => row.provider_ref)
    .map((row) => ({
      id: row.id,
      provider_ref: row.provider_ref as string,
      amount: row.amount,
      refunded: state.refundedByPayment.get(row.id) ?? 0,
    }));
  const roomLeft = onlineRoom(payments, state.refundedByPayment);
  // Without an amount, refund everything paid that has not come back yet.
  // (remainingBalance is the tourist's outstanding balance — wrong direction.)
  const amount = input.amount != null ? roundMoney(input.amount) : Math.min(state.refundable, roomLeft);
  if (amount <= 0) return { success: false, error: "There is nothing left to refund on this booking." };
  if (amount > state.refundable + 0.001) {
    return { success: false, error: `Only ${formatPeso(state.refundable)} can still be refunded. PayMongo has already returned the rest.` };
  }

  const plan = planRefund(online, amount);
  if (!plan.ok) return { success: false, error: plan.reason };

  const recorded: RefundLine[] = [];
  const sequenceByPayment = new Map<string, number>();
  for (const slice of plan.slices) {
    const payment = payments.find((row) => row.provider_ref === slice.paymentId);
    if (!payment) return { success: false, error: "A payment on this booking could not be matched." };
    const sequence =
      refundSequence(paymongoRefunds, slice.paymentId, config.mode) + (sequenceByPayment.get(slice.paymentId) ?? 0);
    sequenceByPayment.set(slice.paymentId, (sequenceByPayment.get(slice.paymentId) ?? 0) + 1);
    try {
      const refund = await createRefund(config, {
        paymentId: slice.paymentId,
        amountCentavos: slice.amountCentavos,
        reason: REFUND_REASONS[reasonKey].paymongo,
        notes: refundNotes(booking.booking_reference, reasonLabel).slice(0, REFUND_NOTES_MAX),
        idempotencyKey: idempotencyKeyForRefund({
          bookingId: booking.id,
          paymentId: slice.paymentId,
          sequence,
          amountCentavos: slice.amountCentavos,
          reason: REFUND_REASONS[reasonKey].paymongo,
        }),
      });
      recorded.push({
        payment_id: payment.id,
        provider_ref: refund.id,
        amount: roundMoney(centavosToPesos(refund.attributes.amount)),
        original_payment_ref: slice.paymentId,
      });
    } catch (error) {
      console.error("PayMongo refund error:", error);
      const message = error instanceof Error ? error.message : "PayMongo did not accept the refund.";
      if (recorded.length > 0) {
        // Record what did go through, so the ledger never disagrees with PayMongo.
        const partial = await recordOnlineRefundRows({
          supabase,
          bookingId: booking.id,
          userId: operator.userId,
          paymentRows: payments,
          lines: recorded,
        });
        if (partial.ok) revalidateBookings(booking.id);
        const sent = sumRefundLines(recorded);
        return {
          success: false,
          error: `${message}${
            partial.ok
              ? ` ${formatPeso(sent)} of it went through and was recorded.`
              : ` ${formatPeso(sent)} went through but the ledger could not be updated. Do not send another refund; ask an admin to record ${refundReferences(recorded)} by hand.`
          }`,
        };
      }
      return { success: false, error: message };
    }
  }

  const recordedResult = await recordOnlineRefundRows({
    supabase,
    bookingId: booking.id,
    userId: operator.userId,
    paymentRows: payments,
    lines: recorded,
  });
  if (!recordedResult.ok) {
    return {
      success: false,
      error: `${channel} sent ${formatPeso(amount)}, but the ledger could not be updated (${recordedResult.reason}). Do not send another refund; ask an admin to record these PayMongo references by hand: ${refundReferences(recorded)}.`,
    };
  }

  revalidateBookings(booking.id);
  emailRefundSent(booking.id, amount);
  const remaining = recordedResult.remaining;
  return {
    success: true,
    message:
      remaining > 0
        ? `${channel}: ${formatPeso(amount)} refunded. ${formatPeso(remaining)} can still be refunded.`
        : `${channel}: ${formatPeso(amount)} successfully refunded.`,
  };
}
