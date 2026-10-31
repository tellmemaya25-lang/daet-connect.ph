import { formatPeso } from "@/lib/money";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { LineIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { checkPayable, depositDue, MIN_CHARGE_CENTAVOS, pesosToCentavos, remainingBalance } from "@/lib/paymongo/checkout";
import { PROOF_METHODS, isProofMethod } from "@/lib/tours/payment-proof";
import { PaymentInstructions } from "../../my-bookings/payment-instructions";
import { OnlinePayButton } from "./online-pay-button";
import { OpenDetailsButton } from "./open-details-button";
import { ProofUploadForm } from "./proof-upload-form";

export type PanelBooking = {
  id: string;
  booking_reference: string;
  status: string;
  total_amount: number;
  total_paid: number | null;
  payment_status: string | null;
  /** Reservation fee for the whole booking, if the package has one. */
  deposit_amount?: number | null;
  deposit_refundable?: boolean | null;
};

export type PanelOperator = {
  business_name: string | null;
  contact_phone?: string | null;
  gcash_number?: string | null;
  gcash_name?: string | null;
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_account_name?: string | null;
  payment_instructions?: string | null;
} | null;

export type PanelPayment = {
  id: string;
  amount: number;
  payment_method: string;
  provider: string | null;
  provider_method: string | null;
  reference_number: string | null;
  payment_date: string | null;
  payment_status: string;
};

export type PanelProof = {
  id: string;
  amount: number;
  payment_method: string;
  reference_number: string;
  verification_status: string;
  rejection_reason: string | null;
  submitted_at: string;
};

const peso = formatPeso;
const date = (value: string | null) =>
  value ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(new Date(value)) : "—";

const PAYMENT_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  unpaid: { label: "Unpaid", tone: "warning" },
  partial: { label: "Partially paid", tone: "info" },
  paid: { label: "Paid", tone: "success" },
  refunded: { label: "Refunded", tone: "neutral" },
};

const PROOF_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Waiting for operator", tone: "neutral" },
  verified: { label: "Verified", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};

function methodLabel(payment: PanelPayment): string {
  if (payment.provider === "paymongo") {
    const method = payment.provider_method ?? payment.payment_method;
    return `Online (${method === "card" ? "card" : method === "paymaya" ? "Maya" : method === "gcash" ? "GCash" : method})`;
  }
  return payment.payment_method.replace(/_/g, " ");
}

/** Whether the tourist still has something to pay on this booking. */
export function owesBalance(booking: PanelBooking): boolean {
  return booking.status === "confirmed" && remainingBalance(booking) > 0 && booking.payment_status !== "refunded";
}

/**
 * The booking page's first card while money is owed: the balance once, the
 * way to pay online as the one main button, and paying the operator directly
 * as the quieter choice.
 */
export function PaymentNextStep({
  booking,
  proofs,
  onlinePaymentEnabled,
  paymentReturn,
}: {
  booking: PanelBooking;
  proofs: PanelProof[];
  onlinePaymentEnabled: boolean;
  paymentReturn: "cancelled" | null;
}) {
  const remaining = remainingBalance(booking);
  const payable = checkPayable(booking);
  const paid = Number(booking.total_paid ?? 0);
  const online = onlinePaymentEnabled && payable.ok;
  const waiting = proofs.filter((proof) => proof.verification_status === "pending");
  // A reservation fee still owed is offered first; paying everything stays one tap away.
  const fee = depositDue(booking);
  const feeOnline = online && fee > 0 && fee < remaining && pesosToCentavos(fee) >= MIN_CHARGE_CENTAVOS;

  return (
    <section id="payment" aria-labelledby="next-step" className="mb-6 scroll-mt-6 rounded-2xl bg-surface p-5 ring-2 ring-blue-600/30 sm:p-6">
      <h2 id="next-step" className="text-sm font-bold text-blue-700 dark:text-blue-300">
        Next step
      </h2>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-xl font-bold text-daet-ink">Balance to pay</p>
        <p className="text-3xl font-bold text-daet-ink">{peso(remaining)}</p>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {peso(paid)} of {peso(Number(booking.total_amount))} paid · your ticket QR appears once it is paid in full
      </p>

      {paymentReturn === "cancelled" ? (
        <Notice variant="warning" className="mt-4">
          The online payment was cancelled. You have not been charged.
        </Notice>
      ) : null}
      {waiting.length > 0 ? (
        <Notice variant="info" className="mt-4">
          The operator is checking your receipt for {peso(Number(waiting[0].amount))}. You don&apos;t need to pay again while you wait.
        </Notice>
      ) : null}

      {fee > 0 && fee < remaining ? (
        <p className="mt-3 text-sm text-daet-ink">
          A {peso(fee)} reservation fee secures your slot{booking.deposit_refundable === false ? " (not refundable)" : ""}. The rest is due before the trip.
        </p>
      ) : null}

      <div className="mt-5 space-y-3">
        {feeOnline ? (
          <>
            <OnlinePayButton bookingId={booking.id} amountLabel={peso(fee)} part="deposit" label={`Pay the ${peso(fee)} reservation fee online`} />
            <OnlinePayButton bookingId={booking.id} amountLabel={peso(payable.ok ? payable.amountPesos : remaining)} variant="secondary" note={false} label={`Pay the full ${peso(payable.ok ? payable.amountPesos : remaining)} online`} />
          </>
        ) : online ? (
          <OnlinePayButton bookingId={booking.id} amountLabel={peso(payable.amountPesos)} />
        ) : null}
        <OpenDetailsButton targetId="pay-manually" variant={online ? "ghost" : "primary"} fullWidth>
          {online ? "I paid by bank transfer or GCash" : "See how to pay the operator"}
        </OpenDetailsButton>
      </div>
    </section>
  );
}

export function BookingPaymentPanel({
  booking,
  operator,
  payments,
  proofs,
  onlinePaymentEnabled,
}: {
  booking: PanelBooking;
  operator: PanelOperator;
  payments: PanelPayment[];
  proofs: PanelProof[];
  onlinePaymentEnabled: boolean;
}) {
  const remaining = remainingBalance(booking);
  const status = PAYMENT_STATUS[booking.payment_status ?? "unpaid"] ?? PAYMENT_STATUS.unpaid;
  const awaitingConfirmation = booking.status === "pending";
  const owes = owesBalance(booking);
  const history = proofs.length + payments.length;

  // Nothing owed, nothing sent and nothing to explain: no card.
  if (!owes && !awaitingConfirmation && history === 0) return null;

  return (
    <Card id={owes ? undefined : "payment"} className="mb-6 scroll-mt-6" aria-labelledby="payment-heading">
      <CardHeader title={<span id="payment-heading">Payment</span>} action={<Badge tone={status.tone}>{status.label}</Badge>} />

      {/* While money is owed, the amounts are in the Next step card at the top. */}
      {!owes ? (
        <dl className="grid grid-cols-3 gap-2 rounded-2xl bg-canvas p-4 text-center">
          <div>
            <dt className="text-sm text-slate-600 dark:text-slate-400">Total</dt>
            <dd className="mt-1 font-bold text-daet-ink">{peso(Number(booking.total_amount))}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600 dark:text-slate-400">Paid</dt>
            <dd className="mt-1 font-bold text-green-700 dark:text-green-300">{peso(Number(booking.total_paid ?? 0))}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600 dark:text-slate-400">Balance</dt>
            <dd className="mt-1 font-bold text-daet-forest dark:text-blue-300">{peso(remaining)}</dd>
          </div>
        </dl>
      ) : null}

      {awaitingConfirmation ? (
        <p className="mt-4 text-sm text-daet-ink/70">
          You can pay once the operator confirms your booking. The way to pay will show at the top of this page.
        </p>
      ) : null}

      {owes ? (
        <details id="pay-manually" className="group scroll-mt-6 rounded-2xl bg-canvas p-4" open={!onlinePaymentEnabled}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-bold text-daet-ink">
            Pay the operator directly and send your receipt
            <LineIcon name="chevron-down" className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-4 space-y-5">
            <PaymentInstructions
              operatorName={operator?.business_name || "Operator"}
              gcashNumber={operator?.gcash_number}
              gcashName={operator?.gcash_name}
              bankName={operator?.bank_name}
              bankAccountNumber={operator?.bank_account_number}
              bankAccountName={operator?.bank_account_name}
              paymentInstructions={operator?.payment_instructions}
              totalAmount={remaining}
              bookingReference={booking.booking_reference}
              operatorPhone={operator?.contact_phone}
            />
            <ProofUploadForm bookingId={booking.id} remaining={depositDue(booking) > 0 ? depositDue(booking) : remaining} />
          </div>
        </details>
      ) : null}

      {history > 0 ? (
        <details className="group mt-4 rounded-2xl bg-canvas p-4" open={proofs.some((proof) => proof.verification_status === "rejected")}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-bold text-daet-ink">
            Payments and receipts ({history})
            <LineIcon name="chevron-down" className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
        {proofs.length > 0 ? (
          <section className="mt-3" aria-labelledby="proofs-heading">
            <h3 id="proofs-heading" className="font-bold text-daet-ink">
              Receipts you sent
            </h3>
            <ul className="mt-2 divide-y divide-daet-ink/10">
              {proofs.map((proof) => {
                const proofStatus = PROOF_STATUS[proof.verification_status] ?? PROOF_STATUS.pending;
                return (
                  <li key={proof.id} className="py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-daet-ink">
                        {peso(Number(proof.amount))} · {isProofMethod(proof.payment_method) ? PROOF_METHODS[proof.payment_method] : proof.payment_method}
                      </span>
                      <Badge tone={proofStatus.tone}>{proofStatus.label}</Badge>
                    </div>
                    <p className="text-daet-ink/70">
                      Ref {proof.reference_number} · sent {date(proof.submitted_at)}
                    </p>
                    {proof.verification_status === "rejected" && proof.rejection_reason ? (
                      <p className="mt-1 rounded-2xl bg-red-50 dark:bg-red-950/40 px-3 py-2 text-red-900 dark:text-red-300">Operator&apos;s note: {proof.rejection_reason}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {payments.length > 0 ? (
          <section className="mt-4" aria-labelledby="payments-heading">
            <h3 id="payments-heading" className="font-bold text-daet-ink">
              Payment history
            </h3>
            <ul className="mt-2 divide-y divide-daet-ink/10">
              {payments.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-bold capitalize text-daet-ink">{methodLabel(payment)}</p>
                    <p className="truncate text-daet-ink/70">
                      {date(payment.payment_date)}
                      {payment.reference_number ? ` · Ref ${payment.reference_number}` : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 font-bold ${payment.payment_status === "refunded" ? "text-daet-ink/70 line-through" : "text-green-700 dark:text-green-300"}`}>
                    {peso(Number(payment.amount))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        </details>
      ) : null}
    </Card>
  );
}
