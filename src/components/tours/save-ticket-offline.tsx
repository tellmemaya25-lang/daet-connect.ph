"use client";

import { useEffect, useState } from "react";

/**
 * Registers the service worker and asks it to keep this ticket page, so the QR
 * opens without signal. Shows nothing until the page is really saved.
 */
export function SaveTicketOffline() {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("caches" in window)) return;
    let cancelled = false;
    (async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const ready = await navigator.serviceWorker.ready;
        (ready.active ?? registration.active)?.postMessage({ type: "save-ticket", path: window.location.pathname });
        // Give the worker a moment to store the page, then confirm it did.
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const cached = await caches.match(window.location.pathname, { cacheName: "daet-tickets-v1" });
        if (!cancelled && cached) setSaved(true);
      } catch {
        // Offline saving is a convenience; the ticket still works online.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return saved ? (
    <p role="status" className="mt-3 text-sm text-daet-ink/80 print:hidden">
      Saved on this phone, so your QR opens without signal until you sign out.
    </p>
  ) : null;
}
