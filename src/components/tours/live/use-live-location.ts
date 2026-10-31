"use client";

import { useEffect, useRef, useState } from "react";
import { shouldSend, WEAK_ACCURACY_M, type Fix } from "@/lib/tours/live-tracking";

export type LocationStatus = "off" | "asking" | "on" | "weak" | "paused" | "denied" | "unavailable";

/**
 * Watches the phone's location while `enabled` and hands fixes to `send`,
 * no more often than shouldSend() allows. A website can't track a locked
 * phone: when the page is hidden the status becomes "paused" and sending
 * resumes when it is visible again.
 */
export function useLiveLocation(enabled: boolean, send: (fix: Fix) => Promise<boolean>) {
  const [status, setStatus] = useState<LocationStatus>("off");
  const [fix, setFix] = useState<Fix | null>(null);
  const lastSent = useRef<Fix | null>(null);
  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(() => {
    if (!enabled) {
      setStatus("off");
      lastSent.current = null;
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    setStatus("asking");
    let sending = false;
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        const next: Fix = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: Math.round(position.coords.accuracy), at: Date.now() };
        setFix(next);
        setStatus(document.visibilityState === "hidden" ? "paused" : next.accuracy && next.accuracy > WEAK_ACCURACY_M ? "weak" : "on");
        if (sending || !shouldSend(lastSent.current, next)) return;
        sending = true;
        void sendRef.current(next)
          .then((ok) => {
            if (ok) lastSent.current = next;
          })
          .finally(() => {
            sending = false;
          });
      },
      (error) => setStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
    const onVisibility = () => setStatus((s) => (document.visibilityState === "hidden" ? "paused" : s === "paused" ? "on" : s));
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      navigator.geolocation.clearWatch(watch);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);

  return { status, fix };
}

export const LOCATION_STATUS_TEXT: Record<LocationStatus, string> = {
  off: "Not sharing.",
  asking: "Waiting for your location… Allow location access if your phone asks.",
  on: "Sharing your location.",
  weak: "Sharing, but the signal is weak. Your spot may be off by more than 100 m.",
  paused: "Paused while this page is in the background. Keep it open to keep sharing.",
  denied: "Location is blocked. Allow it for this site in your browser settings, then reload.",
  unavailable: "This phone couldn't find its location. Try again outdoors.",
};
