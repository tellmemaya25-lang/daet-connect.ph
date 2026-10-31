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
  // recordFailed: PayMongo says paid but saving it failed; the webhook or a later visit records it.
  | { status: "paid"; recorded: number; recordFailed: boolean; amountCentavos: number; method: string | null }
  | { status: "unpaid" }
  | { status: "unknown"; reason: "no_session" | "not_configured" | "mismatch" | "error" };

export async function confirmCheckoutReturn(bookingId: string, sessionId: string | undefined): Promise<ReturnCheck> {
  if (!sessionId) return { status: "unknown", reason: "no_session" };
  const config = getPaymongoConfig();
  if (!config) return { status: "unknown", reason: "not_configured" };
  let session: unknown;
  try {
    session = await retrieveCheckoutSession(config, sessionId);
  } catch (error) {
    console.error("PayMongo return check failed:", error);
    return { status: "unknown", reason: "error" };
  }
  if (sessionBookingId(session) !== bookingId) return { status: "unknown", reason: "mismatch" };
  const paid = extractPaidPayments(session);
  if (paid.length === 0) return { status: "unpaid" };

  // The tourist has paid either way; a failed save must not hide that.
  let recorded = 0;
  let recordFailed = false;
  try {
    const rows = ledgerRowsFromSession({
      session,
      sessionId,
      bookingId,
      now: new Date(),
      rawEvent: (paymentId) => ({ source: "return", session_id: sessionId, payment_id: paymentId }),
    });
    recorded = await createSupabaseWebhookStore(createSupabaseAdminClient()).insertPayments(rows);
  } catch (error) {
    console.error("PayMongo payment confirmed but not recorded:", error);
    recordFailed = true;
  }
  return {
    status: "paid",
    recorded,
    recordFailed,
    amountCentavos: paid.reduce((sum, p) => sum + p.amountCentavos, 0),
    method: paid[0]?.method ?? null,
  };
}
