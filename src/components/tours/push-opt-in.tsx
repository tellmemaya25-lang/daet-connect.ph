"use client";

import { LineIcon } from "@/components/ui/icons";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { removePushSubscription, savePushSubscription } from "@/app/(subsystems)/tours/notifications/actions";

type PushState = "loading" | "unsupported" | "unconfigured" | "denied" | "off" | "on";

const DISMISS_KEY = "connect-daet:push-prompt-dismissed";
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration ? registration.pushManager.getSubscription() : null;
}

/**
 * Turns phone/desktop notifications on or off for this browser.
 * `variant="prompt"` is the dismissible card shown after booking;
 * `variant="settings"` is the toggle on the notifications page.
 */
export function PushOptIn({ variant = "settings" }: { variant?: "prompt" | "settings" }) {
  const [state, setState] = useState<PushState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      // Storage can be blocked; the prompt just shows again.
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    if (!VAPID_PUBLIC_KEY) {
      setState("unconfigured");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    currentSubscription()
      .then((subscription) => setState(subscription ? "on" : "off"))
      .catch(() => setState("off"));
  }, []);

  function enable() {
    setError(null);
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        const subscription =
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }));
        const result = await savePushSubscription(subscription.toJSON());
        if (!result.success) {
          setError(result.error ?? "Notifications could not be turned on.");
          return;
        }
        setState("on");
      } catch {
        setError("Notifications could not be turned on in this browser.");
      }
    });
  }

  function disable() {
    setError(null);
    startTransition(async () => {
      const subscription = await currentSubscription().catch(() => null);
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe().catch(() => undefined);
      }
      setState("off");
    });
  }

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  }

  if (variant === "prompt") {
    if (state !== "off" || dismissed) return null;
    return (
      <section className="mb-6 rounded-2xl border border-daet-forest/20 bg-daet-forest/5 p-5">
        <p className="font-bold text-daet-ink"><LineIcon name="bell" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /> Get updates on your phone</p>
        <p className="mt-1 text-sm text-daet-ink/70">We&apos;ll tell you when the operator confirms, when your guide is assigned and when you get a message.</p>
        {error ? <p className="mt-2 text-sm font-semibold text-red-700">{error}</p> : null}
        <div className="mt-3 flex flex-wrap gap-3">
          <Button onClick={enable} loading={pending} loadingText="Turning on…">
            Turn on notifications
          </Button>
          <Button variant="ghost" onClick={dismiss}>
            Not now
          </Button>
        </div>
      </section>
    );
  }

  const description: Record<PushState, string> = {
    loading: "Checking this browser…",
    unsupported: "This browser can't receive push notifications. On iPhone, add CONNECT-Daet to your Home Screen first (Share → Add to Home Screen).",
    unconfigured: "Push notifications are not set up on this site yet. You'll still see updates here.",
    denied: "Notifications are blocked for this site. Allow them in your browser's site settings, then come back.",
    off: "Get booking, payment and message updates on this device even when CONNECT-Daet is closed.",
    on: "This device receives push notifications.",
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-bold text-daet-ink">Push notifications on this device</p>
        <p className="text-sm text-daet-ink/65">{description[state]}</p>
        {error ? <p className="mt-1 text-sm font-semibold text-red-700">{error}</p> : null}
      </div>
      {state === "off" ? (
        <Button onClick={enable} loading={pending} loadingText="Turning on…" className="shrink-0">
          Turn on
        </Button>
      ) : state === "on" ? (
        <Button variant="secondary" onClick={disable} loading={pending} loadingText="Turning off…" className="shrink-0">
          Turn off
        </Button>
      ) : null}
    </div>
  );
}
