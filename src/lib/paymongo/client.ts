import "server-only";
import { resolveAppUrl } from "@/lib/app-url";
import { parsePaymentMethods, type PaymongoMethod } from "@/lib/paymongo/checkout";
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
