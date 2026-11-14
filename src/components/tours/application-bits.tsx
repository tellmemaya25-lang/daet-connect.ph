"use client";

import { useState, useTransition } from "react";
import { formatPeso } from "@/lib/money";
import { pctText, shareOf } from "@/lib/tours/guide-applications";

/** What a guide or operator application action returns. */
export type ApplicationResult = { ok: boolean; message: string };

/** Runs one server action at a time and keeps its answer for the live region. */
export function useApplicationAction() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ApplicationResult | null>(null);
  const run = (action: () => Promise<ApplicationResult>) => start(async () => setResult(await action()));
  return { pending, result, run };
}

export function ResultLine({ result }: { result: ApplicationResult | null }) {
  return (
    <p role="status" aria-live="polite" className={`text-sm font-semibold ${result?.ok === false ? "text-red-700 dark:text-red-300" : "text-green-800 dark:text-green-300"}`}>
      {result?.message ?? ""}
    </p>
  );
}

/** What a share pays on a few tour prices, so both sides can judge an offer. */
export function ShareExamples({ pct }: { pct: number }) {
  return (
    <p className="text-sm text-slate-600 dark:text-slate-400">
      At {pctText(pct)}: {[1000, 2500, 5000].map((price) => `${formatPeso(shareOf(pct, price))} on a ${formatPeso(price)} tour`).join(" · ")}. Pickup fees aren&apos;t counted.
    </p>
  );
}
