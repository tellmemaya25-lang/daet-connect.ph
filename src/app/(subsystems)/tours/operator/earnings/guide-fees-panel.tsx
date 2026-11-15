"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { formatPeso } from "@/lib/money";
import type { GuideFeeRow } from "@/lib/tours/earnings";
import { markGuideFeesPaid } from "./actions";

const day = (key: string) => new Date(`${key}T00:00:00+08:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" });

/** Guide fees on completed tours: what is still owed to each guide, and a way to mark it paid. */
export function GuideFeesPanel({ rows: initial }: { rows: GuideFeeRow[] }) {
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const owed = rows.filter((r) => !r.paidAt);
  const owedTotal = owed.reduce((sum, r) => sum + r.fee, 0);

  const update = (ids: string[], paid: boolean) =>
    startTransition(async () => {
      const result = await markGuideFeesPaid(ids, paid);
      if (!result.success) return setError(result.error ?? "The guide fees could not be updated.");
      setError(null);
      const now = new Date().toISOString();
      setRows((rs) => rs.map((r) => (ids.includes(r.id) ? { ...r, paidAt: paid ? now : null } : r)));
    });

  return (
    <section aria-label="Guide fees" className="mt-6 rounded-2xl card-edge bg-surface p-5" aria-busy={pending}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-daet-ink">Guide fees</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {owed.length ? `${formatPeso(owedTotal)} owed on ${owed.length} completed tour${owed.length === 1 ? "" : "s"}.` : "Every guide fee in this range is paid."} Your guides see what you mark here.
          </p>
        </div>
        {owed.length > 1 ? (
          <Button type="button" variant="secondary" disabled={pending} onClick={() => update(owed.map((r) => r.id), true)}>
            Mark all {owed.length} paid
          </Button>
        ) : null}
      </div>
      {error ? (
        <Notice variant="error" className="mt-3">
          {error}
        </Notice>
      ) : null}
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">No completed tours with a guide fee in this range.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
              <span>
                <span className="font-bold text-daet-ink">{r.guide}</span>
                <span className="text-slate-600 dark:text-slate-400">
                  {" "}
                  · {day(r.date)} · {r.title} · {r.reference}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="font-bold">{formatPeso(r.fee)}</span>
                {r.paidAt ? (
                  <>
                    <span className="text-green-800 dark:text-green-300">Paid</span>
                    <Button type="button" variant="ghost" disabled={pending} onClick={() => update([r.id], false)} aria-label={`Undo paid for ${r.guide}, ${r.reference}`}>
                      Undo
                    </Button>
                  </>
                ) : (
                  <Button type="button" disabled={pending} onClick={() => update([r.id], true)} aria-label={`Mark ${r.guide}'s fee for ${r.reference} paid`}>
                    Mark paid
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
