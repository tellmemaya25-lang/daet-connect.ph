"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** While PayMongo finishes, re-check every few seconds for about a minute. */
export function RefreshUntilPaid({ everyMs = 4000, maxTries = 15 }: { everyMs?: number; maxTries?: number }) {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (tries >= maxTries) return;
    const timer = window.setTimeout(() => {
      router.refresh();
      setTries((n) => n + 1);
    }, everyMs);
    return () => window.clearTimeout(timer);
  }, [tries, maxTries, everyMs, router]);
  return tries >= maxTries ? (
    <p className="mt-3 text-sm text-daet-ink/75">Still waiting on PayMongo. You can leave this page; your booking updates by itself once the payment is confirmed.</p>
  ) : (
    <p className="mt-3 inline-flex items-center gap-2 text-sm text-daet-ink/75" aria-live="polite">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" aria-hidden="true" />
      Checking with PayMongo…
    </p>
  );
}
