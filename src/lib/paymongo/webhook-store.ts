import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LedgerInsert, WebhookStore } from "@/lib/paymongo/webhook";

/** Webhook persistence through the service-role client (the webhook has no user session). */
export function createSupabaseWebhookStore(admin: SupabaseClient): WebhookStore {
  return {
    async recordEvent(event) {
      const { error: insertError } = await admin
        .from("tours_payment_events")
        .upsert(
          { event_id: event.id, event_type: event.type, livemode: event.livemode, payload: event.payload },
          { onConflict: "event_id", ignoreDuplicates: true },
        );
      if (insertError) throw new Error(`Could not record webhook event: ${insertError.message}`);

      const { data, error } = await admin
        .from("tours_payment_events")
        .select("processed_at")
        .eq("event_id", event.id)
        .single();
      if (error) throw new Error(`Could not read webhook event: ${error.message}`);
      return { alreadyProcessed: Boolean(data.processed_at) };
    },

    async bookingExists(bookingId) {
      const { data, error } = await admin.from("tours_bookings").select("id").eq("id", bookingId).maybeSingle();
      if (error) throw new Error(`Could not load booking: ${error.message}`);
      return Boolean(data);
    },

    async insertPayments(rows: LedgerInsert[]) {
      const { data, error } = await admin
        .from("tours_payments")
        .upsert(rows, { onConflict: "provider,provider_ref", ignoreDuplicates: true })
        .select("id");
      if (error) throw new Error(`Could not record payment: ${error.message}`);
      return data?.length ?? 0;
    },

    async markProcessed(eventId, outcome, bookingId) {
      const { error } = await admin
        .from("tours_payment_events")
        .update({ processed_at: new Date().toISOString(), outcome, booking_id: bookingId })
        .eq("event_id", eventId);
      if (error) throw new Error(`Could not mark webhook event processed: ${error.message}`);
    },
  };
}
