/* CONNECT-Daet service worker: shows Web Push notifications and opens their link. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "CONNECT-Daet", body: event.data ? event.data.text() : "" };
  }
  const url = typeof data.url === "string" && data.url.startsWith("/tours/") ? data.url : "/tours/notifications";
  event.waitUntil(
    self.registration.showNotification(data.title || "CONNECT-Daet", {
      body: data.body || "",
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { url },
      lang: "en-PH",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/tours/notifications", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url === target && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
