import { buildPushPayload, type NotificationRow } from "@/lib/tours/notifications";

/**
 * Sends one notification to every device the recipient subscribed. Kept free
 * of Supabase and web-push imports so it can be unit-tested; the route wires
 * in the real store and sender.
 */

export type StoredSubscription = { id: string; endpoint: string; p256dh_key: string; auth_key: string };

export type PushStore = {
  getNotification(id: string): Promise<(Pick<NotificationRow, "id" | "type" | "title" | "body" | "link"> & { profile_id: string; pushed_at: string | null }) | null>;
  getSubscriptions(profileId: string): Promise<StoredSubscription[]>;
  removeSubscription(id: string): Promise<void>;
  markPushed(id: string): Promise<void>;
};

export type PushSender = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
) => Promise<void>;

export type DeliveryResult = { status: "sent" | "already_sent" | "not_found" | "no_devices"; sent: number; removed: number; failed: number };

/** HTTP status from a web-push error, if any. */
function statusOf(error: unknown): number | null {
  const code = (error as { statusCode?: unknown })?.statusCode;
  return typeof code === "number" ? code : null;
}

export async function deliverNotification(id: string, store: PushStore, send: PushSender): Promise<DeliveryResult> {
  const notification = await store.getNotification(id);
  if (!notification) return { status: "not_found", sent: 0, removed: 0, failed: 0 };
  if (notification.pushed_at) return { status: "already_sent", sent: 0, removed: 0, failed: 0 };

  const subscriptions = await store.getSubscriptions(notification.profile_id);
  if (subscriptions.length === 0) return { status: "no_devices", sent: 0, removed: 0, failed: 0 };

  // Mark first so a retried webhook does not push twice.
  await store.markPushed(notification.id);
  const payload = JSON.stringify(buildPushPayload(notification));
  let sent = 0;
  let removed = 0;
  let failed = 0;
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await send({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh_key, auth: subscription.auth_key } }, payload);
        sent += 1;
      } catch (error) {
        const status = statusOf(error);
        // 404/410: the browser dropped this subscription; forget it.
        if (status === 404 || status === 410) {
          await store.removeSubscription(subscription.id);
          removed += 1;
        } else {
          failed += 1;
        }
      }
    }),
  );
  return { status: "sent", sent, removed, failed };
}
