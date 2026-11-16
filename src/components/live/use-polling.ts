"use client";

import { useEffect, useRef } from "react";
import { nextDelay } from "@/lib/live/schedule";

/** Same name as SIGNING_OUT_EVENT in logout-button (kept here to avoid importing a UI file). */
const SIGNING_OUT = "daet:signing-out";

const MIN_GAP_MS = 1000;
/** Focus, a returning tab or the network coming back only poll when the last poll is this old. */
const WAKE_GAP_MS = 15_000;

/**
 * Runs `task` every `intervalMs` while the tab is visible. It pauses when the
 * tab is hidden, runs at once when the tab comes back, gets focus or the
 * network returns, and waits longer after each failure in a row.
 * Returns nothing; `trigger` lets callers ask for an immediate run.
 */
export function usePolling(task: () => Promise<void>, intervalMs: number, enabled = true) {
  const taskRef = useRef(task);
  taskRef.current = task;
  const triggerRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled) return;
    let timer: number | null = null;
    let failures = 0;
    let stopped = false;
    let running = false;

    const clear = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      clear();
      if (stopped || document.visibilityState !== "visible") return;
      timer = window.setTimeout(run, nextDelay(intervalMs, failures));
    };
    let lastStart = 0;
    const run = async () => {
      clear();
      if (stopped || running || document.visibilityState !== "visible") return;
      // However it is asked (focus, a Realtime nudge, another poll), never more than once a second.
      if (Date.now() - lastStart < MIN_GAP_MS) return schedule();
      lastStart = Date.now();
      running = true;
      try {
        await taskRef.current();
        failures = 0;
      } catch {
        failures += 1;
      } finally {
        running = false;
        schedule();
      }
    };
    // Switching tabs or windows fires these often; a poll a few seconds old is fresh enough.
    const onWake = () => (Date.now() - lastStart < WAKE_GAP_MS ? schedule() : void run());
    const onVisible = () => (document.visibilityState === "visible" ? onWake() : clear());
    const onNow = () => void run();
    // Signing out: stop for good, so no poll can bring the old session back.
    const onSignOut = () => {
      stopped = true;
      clear();
    };

    triggerRef.current = onNow;
    void run();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);
    window.addEventListener(SIGNING_OUT, onSignOut);
    return () => {
      stopped = true;
      clear();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
      window.removeEventListener(SIGNING_OUT, onSignOut);
    };
  }, [intervalMs, enabled]);

  return { trigger: () => triggerRef.current() };
}
