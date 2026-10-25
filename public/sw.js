/* CONNECT-Daet service worker: shows Web Push notifications and opens their link. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Booking tickets keep working without signal. Only the tourist's own ticket
// pages are stored (the QR is part of the page), the cache is cleared when the
// user signs out, and nothing else is cached.
const TICKET_CACHE = "daet-tickets-v1";
const TICKET_PATH = /^\/tours\/bookings\/[0-9a-f-]{36}\/ticket$/i;

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !TICKET_PATH.test(url.pathname)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && !response.redirected) {
          const copy = response.clone();
          event.waitUntil(caches.open(TICKET_CACHE).then((cache) => cache.put(url.pathname, copy)));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(url.pathname, { cacheName: TICKET_CACHE });
        return (
          cached ||
          new Response("You are offline and this ticket has not been saved on this phone yet. Open it once with signal.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }),
  );
});

// The ticket page asks to be saved right after it loads, so the first visit is covered too.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "save-ticket" && typeof data.path === "string" && TICKET_PATH.test(data.path)) {
    event.waitUntil(
      fetch(data.path, { credentials: "same-origin" }).then((response) =>
        response.ok && !response.redirected
          ? caches.open(TICKET_CACHE).then((cache) => cache.put(data.path, response))
          : undefined,
      ).catch(() => undefined),
    );
  }
  if (data.type === "clear-tickets") event.waitUntil(caches.delete(TICKET_CACHE));
});

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
