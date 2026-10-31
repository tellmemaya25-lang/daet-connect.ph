/**
 * Pure helpers for PayMongo Checkout Sessions. Money in the app is pesos
 * (numeric(10,2)); PayMongo uses integer centavos. Convert only here.
 */

export type PaymongoMethod = "gcash" | "paymaya" | "card" | "grab_pay" | "qrph" | "dob" | "billease" | string;

export const DEFAULT_PAYMENT_METHODS: PaymongoMethod[] = ["gcash", "paymaya", "card"];

/** PayMongo's minimum charge is ₱20.00. */
export const MIN_CHARGE_CENTAVOS = 2000;

export function pesosToCentavos(pesos: number): number {
  return Math.round(pesos * 100);
}

export function centavosToPesos(centavos: number): number {
  return Math.round(centavos) / 100;
}

export type PayableBooking = {
  id: string;
  booking_reference: string;
  status: string;
  total_amount: number | string;
  total_paid: number | string | null;
  payment_status: string | null;
};

export function remainingBalance(booking: Pick<PayableBooking, "total_amount" | "total_paid">): number {
  const remaining = Number(booking.total_amount) - Number(booking.total_paid ?? 0);
  return Math.max(0, Math.round(remaining * 100) / 100);
}

/**
 * What is still owed of a booking's reservation fee (0 when it has none or it
 * is already covered). Paying it is optional: the tourist can pay in full.
 */
export function depositDue(booking: { deposit_amount?: number | string | null; total_amount: number | string; total_paid: number | string | null }): number {
  if (booking.deposit_amount == null) return 0;
  const deposit = Math.min(Number(booking.deposit_amount), Number(booking.total_amount));
  return Math.max(0, Math.round((deposit - Number(booking.total_paid ?? 0)) * 100) / 100);
}

export type PayabilityResult = { ok: true; amountPesos: number } | { ok: false; reason: string };

/** Tourists pay after the operator confirms, and only the remaining balance. */
export function checkPayable(booking: PayableBooking): PayabilityResult {
  if (booking.status !== "confirmed") {
    return { ok: false, reason: "You can pay once the operator confirms your booking." };
  }
  if (booking.payment_status === "paid" || booking.payment_status === "refunded") {
    return { ok: false, reason: "This booking has no balance to pay." };
  }
  const amountPesos = remainingBalance(booking);
  if (amountPesos <= 0) return { ok: false, reason: "This booking has no balance to pay." };
  if (pesosToCentavos(amountPesos) < MIN_CHARGE_CENTAVOS) {
    return { ok: false, reason: "The remaining balance is below PayMongo's ₱20.00 minimum. Please pay the operator directly." };
  }
  return { ok: true, amountPesos };
}

export function parsePaymentMethods(value: string | undefined): PaymongoMethod[] {
  const methods = (value ?? "")
    .split(",")
    .map((method) => method.trim().toLowerCase())
    .filter(Boolean);
  return methods.length > 0 ? Array.from(new Set(methods)) : DEFAULT_PAYMENT_METHODS;
}

export function buildCheckoutSessionBody({
  booking,
  packageTitle,
  amountPesos,
  appUrl,
  methods,
  customer,
}: {
  booking: Pick<PayableBooking, "id" | "booking_reference">;
  packageTitle: string;
  amountPesos: number;
  appUrl: string;
  methods: PaymongoMethod[];
  customer?: { name?: string | null; email?: string | null; phone?: string | null };
}) {
  const base = appUrl.replace(/\/+$/, "");
  const bookingUrl = `${base}/tours/bookings/${booking.id}`;
  const billing = customer
    ? Object.fromEntries(
        Object.entries({ name: customer.name, email: customer.email, phone: customer.phone }).filter(([, v]) => Boolean(v)),
      )
    : {};

  return {
    data: {
      attributes: {
        line_items: [
          {
            name: packageTitle.slice(0, 255),
            amount: pesosToCentavos(amountPesos),
            currency: "PHP",
            quantity: 1,
            description: `Booking ${booking.booking_reference}`,
          },
        ],
        payment_method_types: methods,
        description: `CONNECT-DAET tour booking ${booking.booking_reference}`,
        reference_number: booking.booking_reference,
        send_email_receipt: true,
        show_description: true,
        show_line_items: true,
        success_url: `${bookingUrl}/paid`,
        cancel_url: `${bookingUrl}?payment=cancelled`,
        metadata: { booking_id: booking.id },
        ...(Object.keys(billing).length > 0 ? { billing } : {}),
      },
    },
  };
}

export type PaidPayment = {
  id: string;
  amountCentavos: number;
  method: PaymongoMethod | null;
  paidAt: string | null;
};

type Json = Record<string, unknown>;
const asRecord = (value: unknown): Json | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;

/**
 * Reads the paid payments from a checkout session resource (as returned by
 * GET /v1/checkout_sessions/:id or embedded in a webhook event). Looks in
 * `attributes.payments` and falls back to `attributes.payment_intent.attributes.payments`.
 */
export function extractPaidPayments(session: unknown): PaidPayment[] {
  const attributes = asRecord(asRecord(session)?.attributes);
  if (!attributes) return [];

  const intentPayments = asRecord(asRecord(attributes.payment_intent)?.attributes)?.payments;
  const candidates = Array.isArray(attributes.payments) && attributes.payments.length > 0
    ? attributes.payments
    : Array.isArray(intentPayments)
      ? intentPayments
      : [];

  const paid: PaidPayment[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const payment = asRecord(candidate);
    const paymentAttributes = asRecord(payment?.attributes);
    const id = typeof payment?.id === "string" ? payment.id : null;
    const amount = paymentAttributes?.amount;
    if (!id || seen.has(id) || paymentAttributes?.status !== "paid" || typeof amount !== "number" || amount <= 0) continue;
    seen.add(id);

    const source = asRecord(paymentAttributes.source);
    const method =
      (typeof source?.type === "string" && source.type) ||
      (typeof attributes.payment_method_used === "string" && attributes.payment_method_used) ||
      null;
    const paidAtSeconds = paymentAttributes.paid_at;
    paid.push({
      id,
      amountCentavos: amount,
      method,
      paidAt: typeof paidAtSeconds === "number" ? new Date(paidAtSeconds * 1000).toISOString() : null,
    });
  }
  return paid;
}

export function sessionBookingId(session: unknown): string | null {
  const metadata = asRecord(asRecord(asRecord(session)?.attributes)?.metadata);
  const id = metadata?.booking_id;
  return typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

/** Maps a PayMongo method onto the ledger's payment_method values. */
export function ledgerPaymentMethod(method: PaymongoMethod | null): "gcash" | "credit_card" | "other" {
  if (method === "gcash") return "gcash";
  if (method === "card") return "credit_card";
  return "other";
}
