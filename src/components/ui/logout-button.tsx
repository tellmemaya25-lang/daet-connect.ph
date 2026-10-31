"use client";

import { useState } from "react";
import { cn } from "@/components/ui/cn";

/**
 * Signs out through POST /auth/logout, then loads the home page fresh so no
 * signed-in data (or Realtime subscription) survives in the tab.
 */
export function LogoutButton({ className, compact = false, menu = false }: { className?: string; compact?: boolean; /** A plain row in the account menu. */ menu?: boolean }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      const response = await fetch("/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error(String(response.status));
      // Saved tickets belong to the signed-in user; do not leave them on a shared phone.
      if ("caches" in window) await caches.delete("daet-tickets-v1").catch(() => false);
      window.location.assign("/");
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  if (menu) {
    return (
      <>
        <button
          type="button"
          onClick={signOut}
          disabled={pending}
          className={cn("flex min-h-12 w-full items-center rounded-xl px-4 text-left text-base text-daet-ink hover:bg-muted disabled:cursor-wait disabled:opacity-60", className)}
        >
          {pending ? "Signing out…" : "Sign out"}
        </button>
        {failed ? (
          <p role="alert" className="mx-2 mb-1 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 dark:bg-red-950/40 dark:text-red-300">
            Sign-out failed. Check your connection and try again.
          </p>
        ) : null}
      </>
    );
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={signOut}
        disabled={pending}
        aria-label={compact ? "Sign out" : undefined}
        className={cn(
          "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-full border border-daet-ink/15 bg-surface px-3 text-sm font-bold text-daet-ink transition hover:bg-daet-sand disabled:cursor-wait disabled:opacity-60",
          className,
        )}
      >
        <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        <span className={compact ? "sr-only sm:not-sr-only" : undefined}>{pending ? "Signing out…" : "Sign out"}</span>
      </button>
      {failed ? (
        <span role="alert" className="absolute right-0 top-full z-50 mt-1 w-max max-w-[14rem] rounded-2xl bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs font-semibold text-red-800 dark:text-red-300 shadow-[var(--shadow-float)]">
          Sign-out failed. Check your connection and try again.
        </span>
      ) : null}
    </span>
  );
}
