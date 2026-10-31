import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { extractPaidPayments, sessionBookingId } from "@/lib/paymongo/checkout";
import { getPaymongoConfig, retrieveCheckoutSession } from "@/lib/paymongo/client";
import { ledgerRowsFromSession } from "@/lib/paymongo/webhook";
import { createSupabaseWebhookStore } from "@/lib/paymongo/webhook-store";

/**
 * When the tourist comes back from PayMongo, confirm the payment straight
 * from PayMongo instead of waiting for the webhook (which can be late, or
 * blocked by deployment protection). The checkout session id was kept in a
 * cookie when checkout started; the session must belong to this booking.
 */
export const CHECKOUT_COOKIE_PREFIX = "pm_cs_";
export const checkoutCookieName = (bookingId: string) => `${CHECKOUT_COOKIE_PREFIX}${bookingId}`;

export type ReturnCheck =
  | { status: "paid"; recorded: number; amountCentavos: number; method: string | null }
  | { status: "unpaid" }
  | { status: "unknown"; reason: "no_session" | "not_configured" | "mismatch" | "error" };

export async function confirmCheckoutReturn(bookingId: string, sessionId: string | undefined): Promise<ReturnCheck> {
  if (!sessionId) return { status: "unknown", reason: "no_session" };
  const config = getPaymongoConfig();
  if (!config) return { status: "unknown", reason: "not_configured" };
  try {
    const session = await retrieveCheckoutSession(config, sessionId);
    if (sessionBookingId(session) !== bookingId) return { status: "unknown", reason: "mismatch" };
    const paid = extractPaidPayments(session);
    if (paid.length === 0) return { status: "unpaid" };
    const rows = ledgerRowsFromSession({
      session,
      sessionId,
      bookingId,
      now: new Date(),
      rawEvent: (paymentId) => ({ source: "return", session_id: sessionId, payment_id: paymentId }),
    });
    const recorded = await createSupabaseWebhookStore(createSupabaseAdminClient()).insertPayments(rows);
    return {
      status: "paid",
      recorded,
      amountCentavos: paid.reduce((sum, p) => sum + p.amountCentavos, 0),
      method: paid[0]?.method ?? null,
    };
  } catch (error) {
    console.error("PayMongo return check failed:", error);
    return { status: "unknown", reason: "error" };
  }
}
