import "server-only";
import { resolveAppUrl } from "@/lib/app-url";
import { parsePaymentMethods, type PaymongoMethod } from "@/lib/paymongo/checkout";
import { isSettledRefundStatus, type RefundResource } from "@/lib/paymongo/refunds";
import type { SignatureMode } from "@/lib/paymongo/signature";

const API_BASE = "https://api.paymongo.com/v1";

export type PaymongoConfig = {
  secretKey: string;
  webhookSecret: string | null;
  mode: SignatureMode;
  appUrl: string;
  methods: PaymongoMethod[];
};

/** Reads configuration lazily so pages that never pay still work without keys. */
export function getPaymongoConfig(): PaymongoConfig | null {
  const secretKey = process.env.PAYMONGO_SECRET_KEY?.trim();
  if (!secretKey) return null;
  const appUrl = resolveAppUrl();
  return {
    secretKey,
    webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET?.trim() || null,
    mode: secretKey.startsWith("sk_live_") ? "live" : "test",
    appUrl,
    methods: parsePaymentMethods(process.env.PAYMONGO_PAYMENT_METHODS),
  };
}

export function isPaymongoConfigured(): boolean {
  return getPaymongoConfig() !== null;
}

export class PaymongoApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: unknown,
  ) {
    super(message);
    this.name = "PaymongoApiError";
  }
}

async function paymongoRequest<T>(config: PaymongoConfig, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Basic ${Buffer.from(`${config.secretKey}:`).toString("base64")}`,
      ...init.headers,
    },
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const detail = (body as { errors?: Array<{ detail?: string }> } | null)?.errors?.[0]?.detail;
    throw new PaymongoApiError(detail ?? `PayMongo request failed (${response.status})`, response.status, body);
  }
  return body as T;
}

export type CheckoutSessionResource = {
  id: string;
  type: "checkout_session";
  attributes: { checkout_url?: string; metadata?: Record<string, unknown>; payments?: unknown[]; [key: string]: unknown };
};

export async function createCheckoutSession(config: PaymongoConfig, body: unknown): Promise<CheckoutSessionResource> {
  const result = await paymongoRequest<{ data: CheckoutSessionResource }>(config, "/checkout_sessions", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return result.data;
}

export async function retrieveCheckoutSession(config: PaymongoConfig, id: string): Promise<CheckoutSessionResource> {
  if (!/^cs_[A-Za-z0-9]+$/.test(id)) throw new PaymongoApiError("Invalid checkout session id", 400, null);
  const result = await paymongoRequest<{ data: CheckoutSessionResource }>(config, `/checkout_sessions/${id}`);
  return result.data;
}

/**
 * Refunds a PayMongo payment (docs.paymongo.com/reference/refund-resource).
 * `amount` is centavos and must not exceed what that payment has left after
 * its earlier refunds; `refunds.ts` works the split out.
 */
export async function createRefund(
  config: PaymongoConfig,
  input: { paymentId: string; amountCentavos: number; reason: string; notes?: string; idempotencyKey?: string },
): Promise<RefundResource> {
  if (!/^pay_[A-Za-z0-9]+$/.test(input.paymentId)) throw new PaymongoApiError("Invalid payment id", 400, null);
  if (!Number.isInteger(input.amountCentavos) || input.amountCentavos < 100) {
    throw new PaymongoApiError("PayMongo's smallest refund is ₱1.00", 400, null);
  }
  const idempotencyKey = input.idempotencyKey?.trim().slice(0, 255);
  const result = await paymongoRequest<{ data: RefundResource }>(config, "/refunds", {
    method: "POST",
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    body: JSON.stringify({
      data: {
        attributes: {
          amount: input.amountCentavos,
          payment_id: input.paymentId,
          reason: input.reason,
          ...(input.notes ? { notes: input.notes.slice(0, 255) } : {}),
        },
      },
    }),
  });
  const refund = result.data;
  if (!/^ref_[A-Za-z0-9_-]+$/.test(refund?.id ?? "")) {
    throw new PaymongoApiError("PayMongo did not return a refund reference", 502, result);
  }
  if (refund.attributes?.payment_id !== input.paymentId || !isSettledRefundStatus(refund.attributes?.status)) {
    throw new PaymongoApiError(`PayMongo did not accept the refund (${refund.attributes?.status ?? "unknown"})`, 502, result);
  }
  return refund;
}

/**
 * Every refund PayMongo has for one payment. Read before creating a refund:
 * a previous attempt may have sent the money even though our ledger write
 * failed. The filter is the documented `data.attributes.payment_id` one.
 */
export async function listRefunds(config: PaymongoConfig, paymentId: string): Promise<RefundResource[]> {
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) throw new PaymongoApiError("Invalid payment id", 400, null);
  const refunds: RefundResource[] = [];
  let after: string | null = null;
  // A booking can be paid in instalments, but a single payment rarely has
  // more than a page of refunds; cap the loop so a bad cursor cannot spin.
  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({
      "data.attributes.payment_id": paymentId,
      "data.attributes.limit": "100",
    });
    if (after) query.set("data.attributes.after", after);
    const result = await paymongoRequest<{ data: RefundResource[]; has_more?: boolean }>(config, `/refunds?${query}`);
    const rows = Array.isArray(result?.data) ? result.data : [];
    refunds.push(...rows);
    if (!result?.has_more || rows.length === 0) break;
    after = rows[rows.length - 1]?.id ?? null;
    if (!after) break;
  }
  return refunds;
}
