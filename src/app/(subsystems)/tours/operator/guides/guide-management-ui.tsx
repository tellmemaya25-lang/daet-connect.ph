"use client";

import { useState } from "react";
import { ResultLine, useApplicationAction } from "@/components/tours/application-bits";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { guidesForPackage, moveInRanking, type GuideStat, type GuideStats } from "@/lib/tours/guide-management";
import { setAutoAssign, setPackageGuideRanking } from "./actions";

/** On: new bookings get the picked guide straight away. Off: a proposal the operator approves. */
export function AutoAssignSwitch({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const { pending, result, run } = useApplicationAction();
  return (
    <div className="space-y-2">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={pending}
        onClick={() => {
          const next = !on;
          setOn(next);
          run(async () => {
            const r = await setAutoAssign(next);
            if (!r.ok) setOn(!next);
            return r;
          });
        }}
        className="flex min-h-11 items-center gap-3 rounded-full text-left font-bold text-daet-ink"
      >
        <span aria-hidden="true" className={`relative inline-flex h-8 w-14 shrink-0 rounded-full transition-colors ${on ? "bg-blue-600" : "bg-muted-strong"}`}>
          <span className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-surface transition-transform ${on ? "translate-x-6" : ""}`} />
        </span>
        Assign guides automatically
      </button>
      <ResultLine result={result} />
    </div>
  );
}

const statLine = (g: GuideStat) =>
  [`${g.recentTours} tour${g.recentTours === 1 ? "" : "s"} in 30 days`, `${g.freeDays} free day${g.freeDays === 1 ? "" : "s"} ahead`, g.rating !== null ? `${g.rating.toFixed(1)}★` : null].filter(Boolean).join(" · ");

/**
 * Pick a package: see its ranked guides and team guides who have led it, and
 * set the order automatic assignment tries them in.
 */
export function PackageGuidesPanel({ stats }: { stats: GuideStats }) {
  const [packageId, setPackageId] = useState(stats.packages[0]?.id ?? "");
  const [order, setOrder] = useState<string[]>(stats.packages[0]?.guideIds ?? []);
  const { pending, result, run } = useApplicationAction();
  const byId = new Map(stats.guides.map((g) => [g.id, g]));
  const groups = guidesForPackage({ ...stats, packages: stats.packages.map((p) => (p.id === packageId ? { ...p, guideIds: order } : p)) }, packageId);

  if (!stats.packages.length) return <p className="text-slate-600 dark:text-slate-400">Add a package first.</p>;

  const add = (id: string) => setOrder((o) => (o.includes(id) ? o : [...o, id]));
  const remove = (id: string) => setOrder((o) => o.filter((x) => x !== id));

  return (
    <div className="space-y-4">
      <Field id="package-filter" label="Tour" hint="Shows who is listed for it, and who has led it before.">
        <Select
          value={packageId}
          onChange={(e) => {
            setPackageId(e.target.value);
            setOrder(stats.packages.find((p) => p.id === e.target.value)?.guideIds ?? []);
          }}
          className="max-w-md"
        >
          {stats.packages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </Select>
      </Field>

      <section aria-label="Ranked guides for this tour" className="space-y-2">
        <h3 className="font-bold text-daet-ink">Ranked for this tour</h3>
        {order.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">None yet. Automatic assignment uses any free team guide who serves this tour&apos;s area.</p>
        ) : (
          <ol className="space-y-2">
            {order.map((id, i) => {
              const g = byId.get(id);
              if (!g) return null;
              return (
                <li key={id} className="flex flex-wrap items-center gap-2 rounded-xl bg-canvas p-3">
                  <span className="w-6 text-center font-bold text-daet-ink">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-daet-ink">{g.name}</span>
                    <span className="block text-sm text-slate-600 dark:text-slate-400">{statLine(g)}</span>
                  </span>
                  <Button variant="ghost" size="icon" aria-label={`Move ${g.name} up`} disabled={i === 0} onClick={() => setOrder((o) => moveInRanking(o, id, -1))}>
                    ↑
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Move ${g.name} down`} disabled={i === order.length - 1} onClick={() => setOrder((o) => moveInRanking(o, id, 1))}>
                    ↓
                  </Button>
                  <Button variant="ghost" onClick={() => remove(id)} aria-label={`Remove ${g.name} from this tour`}>
                    Remove
                  </Button>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {[
        { title: "Have led this tour", list: groups.ledBefore },
        { title: "Others on your team", list: groups.others },
      ].map(({ title, list }) =>
        list.length ? (
          <section key={title} aria-label={title} className="space-y-2">
            <h3 className="font-bold text-daet-ink">{title}</h3>
            <ul className="space-y-2">
              {list.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-daet-ink/10 p-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-daet-ink">{g.name}</span>
                    <span className="block text-sm text-slate-600 dark:text-slate-400">{statLine(g)}</span>
                  </span>
                  <Button variant="secondary" onClick={() => add(g.id)} aria-label={`Add ${g.name} to this tour`}>
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}

      <Button disabled={pending} onClick={() => run(() => setPackageGuideRanking(packageId, order))}>
        {pending ? "Saving…" : "Save ranking"}
      </Button>
      <ResultLine result={result} />
    </div>
  );
}
