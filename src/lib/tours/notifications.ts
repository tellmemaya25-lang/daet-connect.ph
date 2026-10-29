/**
 * In-app notifications (rows written by database triggers, see the F5
 * migration) and the Web Push payload built from them.
 */

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

const ICONS: Record<string, string> = {
  booking_created: "📥",
  booking_confirmed: "✅",
  booking_declined: "⛔",
  booking_cancelled: "🚫",
  booking_completed: "⭐",
  cancellation_requested: "↩️",
  cancellation_approved: "↩️",
  cancellation_declined: "↩️",
  guide_assigned: "🧭",
  payment_received: "💸",
  refund_recorded: "💸",
  proof_submitted: "🧾",
  proof_rejected: "🧾",
  checked_in: "🎟️",
  message: "💬",
  accreditation_approved: "🏅",
  accreditation_rejected: "📝",
  package_approved: "🌴",
  package_rejected: "📝",
  review_received: "⭐",
  review_reply: "💬",
  points_earned: "🎁",
  merch_submitted: "🛍️",
  merch_approved: "🛍️",
  merch_rejected: "📝",
  guide_swap_requested: "🔁",
  guide_swap_approved: "✅",
  guide_swap_rejected: "↩️",
};

export function notificationIcon(type: string): string {
  return ICONS[type] ?? "🔔";
}

/** Links come from our triggers; anything else falls back to the notifications page. */
export function safeNotificationLink(link: string | null | undefined): string {
  return typeof link === "string" && /^\/tours\/[A-Za-z0-9/_?=&.-]*$/.test(link) && !link.includes("//") ? link : "/tours/notifications";
}

export type PushPayload = { title: string; body: string; url: string; tag: string };

export function buildPushPayload(notification: Pick<NotificationRow, "id" | "type" | "title" | "body" | "link">): PushPayload {
  const url = safeNotificationLink(notification.link);
  return {
    title: notification.title.slice(0, 120),
    body: (notification.body ?? "").slice(0, 300),
    url,
    // Messages from one thread replace each other on the lock screen.
    tag: notification.type === "message" ? `message:${url}` : `notification:${notification.id}`,
  };
}

export function unreadCount(rows: Pick<NotificationRow, "read_at">[]): number {
  return rows.filter((row) => !row.read_at).length;
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", then a date. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)} d ago`;
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" });
}

export type PushSubscriptionInput = { endpoint: string; p256dh: string; auth: string };

/** Validates what the browser's PushSubscription.toJSON() sent. */
export function parsePushSubscription(value: unknown): PushSubscriptionInput | null {
  if (!value || typeof value !== "object") return null;
  const { endpoint, keys } = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== "string" || endpoint.length > 1000) return null;
  try {
    if (new URL(endpoint).protocol !== "https:") return null;
  } catch {
    return null;
  }
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  const b64 = /^[A-Za-z0-9_-]+={0,2}$/;
  if (typeof p256dh !== "string" || typeof auth !== "string" || !b64.test(p256dh) || !b64.test(auth) || p256dh.length > 200 || auth.length > 100) {
    return null;
  }
  return { endpoint, p256dh, auth };
}
