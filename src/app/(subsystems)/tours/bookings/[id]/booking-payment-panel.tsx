import { formatPeso } from "@/lib/money";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { checkPayable, remainingBalance } from "@/lib/paymongo/checkout";
import { PROOF_METHODS, isProofMethod } from "@/lib/tours/payment-proof";
import { PaymentInstructions } from "../../my-bookings/payment-instructions";
import { OnlinePayButton } from "./online-pay-button";
import { ProofUploadForm } from "./proof-upload-form";

export type PanelBooking = {
  id: string;
  booking_reference: string;
  status: string;
  total_amount: number;
  total_paid: number | null;
  payment_status: string | null;
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
  pending: { label: "Waiting for operator", tone: "warning" },
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

export function BookingPaymentPanel({
  booking,
  operator,
  payments,
  proofs,
  onlinePaymentEnabled,
  paymentReturn,
}: {
  booking: PanelBooking;
  operator: PanelOperator;
  payments: PanelPayment[];
  proofs: PanelProof[];
  onlinePaymentEnabled: boolean;
  paymentReturn: "success" | "cancelled" | null;
}) {
  const remaining = remainingBalance(booking);
  const payable = checkPayable(booking);
  const status = PAYMENT_STATUS[booking.payment_status ?? "unpaid"] ?? PAYMENT_STATUS.unpaid;
  const awaitingConfirmation = booking.status === "pending";
  const canPayManually = booking.status === "confirmed" && remaining > 0 && booking.payment_status !== "refunded";

  return (
    <Card id="payment" className="mb-6 scroll-mt-6" aria-labelledby="payment-heading">
      <CardHeader title={<span id="payment-heading">Pay for this tour</span>} action={<Badge tone={status.tone}>{status.label}</Badge>} />

      {paymentReturn === "success" && booking.payment_status !== "paid" ? (
        <Notice variant="info" title="Payment received by PayMongo" className="mb-4">
          We&apos;re confirming it now. This usually takes under a minute; refresh this page to see the update.
        </Notice>
      ) : null}
      {paymentReturn === "success" && booking.payment_status === "paid" ? (
        <Notice variant="success" title="Payment confirmed" className="mb-4">
          Thank you! Your booking is fully paid.
        </Notice>
      ) : null}
      {paymentReturn === "cancelled" ? (
        <Notice variant="warning" className="mb-4">
          The online payment was cancelled. You have not been charged.
        </Notice>
      ) : null}

      <dl className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-4 text-center">
        <div>
          <dt className="text-sm text-slate-600">Total</dt>
          <dd className="mt-1 font-bold text-daet-ink">{peso(Number(booking.total_amount))}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-600">Paid</dt>
          <dd className="mt-1 font-bold text-green-700">{peso(Number(booking.total_paid ?? 0))}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-600">Balance</dt>
          <dd className="mt-1 font-bold text-daet-forest">{peso(remaining)}</dd>
        </div>
      </dl>

      {awaitingConfirmation ? (
        <p className="mt-4 text-sm text-daet-ink/70">
          You can pay once the operator confirms your booking. We&apos;ll show the payment options here.
        </p>
      ) : null}

      {canPayManually ? (
        <div className="mt-5 space-y-6">
          {onlinePaymentEnabled && payable.ok ? (
            <OnlinePayButton bookingId={booking.id} amountLabel={peso(payable.amountPesos)} />
          ) : null}

          <details className="group rounded-2xl bg-slate-50 p-4" open={!onlinePaymentEnabled}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-bold text-daet-ink">
              {onlinePaymentEnabled ? "Paid the operator directly? Upload your receipt" : "Pay the operator and upload your receipt"}
              <span className="transition group-open:rotate-180" aria-hidden="true">⌄</span>
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
              <ProofUploadForm bookingId={booking.id} remaining={remaining} />
            </div>
          </details>
        </div>
      ) : null}

      {proofs.length > 0 ? (
        <section className="mt-6" aria-labelledby="proofs-heading">
          <h3 id="proofs-heading" className="text-lg font-bold text-daet-ink">
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
                    <p className="mt-1 rounded-2xl bg-red-50 px-3 py-2 text-red-900">Operator&apos;s note: {proof.rejection_reason}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {payments.length > 0 ? (
        <section className="mt-6" aria-labelledby="payments-heading">
          <h3 id="payments-heading" className="text-lg font-bold text-daet-ink">
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
                <span className={`shrink-0 font-bold ${payment.payment_status === "refunded" ? "text-daet-ink/70 line-through" : "text-green-700"}`}>
                  {peso(Number(payment.amount))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Card>
  );
}
