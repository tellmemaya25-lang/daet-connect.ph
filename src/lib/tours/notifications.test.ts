import {
  buildPushPayload,
  notificationIcon,
  parsePushSubscription,
  safeNotificationLink,
  timeAgo,
  unreadCount,
} from "@/lib/tours/notifications";

describe("safeNotificationLink", () => {
  it("keeps in-app links and rejects anything else", () => {
    expect(safeNotificationLink("/tours/bookings/abc")).toBe("/tours/bookings/abc");
    expect(safeNotificationLink("/tours/operator/bookings?status=pending")).toBe("/tours/operator/bookings?status=pending");
    for (const bad of ["https://evil.example", "//evil.example", "/tours//evil", "javascript:alert(1)", "/other", null, undefined]) {
      expect(safeNotificationLink(bad)).toBe("/tours/notifications");
    }
  });
});

describe("buildPushPayload", () => {
  it("builds a lock-screen payload; messages from one thread share a tag", () => {
    expect(buildPushPayload({ id: "n1", type: "payment_received", title: "Payment received", body: "₱500.00", link: "/tours/operator/payments" })).toEqual({
      title: "Payment received",
      body: "₱500.00",
      url: "/tours/operator/payments",
      tag: "notification:n1",
    });
    const a = buildPushPayload({ id: "n2", type: "message", title: "New message", body: "Hi", link: "/tours/messages/c1" });
    const b = buildPushPayload({ id: "n3", type: "message", title: "New message", body: "Hello", link: "/tours/messages/c1" });
    expect(a.tag).toBe(b.tag);
  });

  it("caps lengths and handles a missing body", () => {
    const payload = buildPushPayload({ id: "n", type: "x", title: "t".repeat(200), body: null, link: null });
    expect(payload.title).toHaveLength(120);
    expect(payload.body).toBe("");
    expect(payload.url).toBe("/tours/notifications");
  });
});

describe("helpers", () => {
  it("counts unread and picks icons", () => {
    expect(unreadCount([{ read_at: null }, { read_at: "2026-10-23T00:00:00Z" }, { read_at: null }])).toBe(2);
    expect(notificationIcon("message")).toBe("💬");
    expect(notificationIcon("unknown")).toBe("🔔");
  });

  it("formats relative time", () => {
    const now = new Date("2026-10-23T12:00:00Z");
    expect(timeAgo("2026-10-23T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-10-23T11:55:00Z", now)).toBe("5 min ago");
    expect(timeAgo("2026-10-23T09:00:00Z", now)).toBe("3 h ago");
    expect(timeAgo("2026-10-21T12:00:00Z", now)).toBe("2 d ago");
    expect(timeAgo("2026-10-01T12:00:00Z", now)).toContain("Oct");
  });
});

describe("parsePushSubscription", () => {
  const good = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } };
  it("accepts a browser subscription", () => {
    expect(parsePushSubscription(good)).toEqual({ endpoint: good.endpoint, p256dh: good.keys.p256dh, auth: good.keys.auth });
  });
  it("rejects missing keys, http endpoints and junk", () => {
    expect(parsePushSubscription({ ...good, endpoint: "http://insecure.example/x" })).toBeNull();
    expect(parsePushSubscription({ endpoint: good.endpoint })).toBeNull();
    expect(parsePushSubscription({ ...good, keys: { p256dh: "bad key!", auth: "x" } })).toBeNull();
    expect(parsePushSubscription("nope")).toBeNull();
  });
});
