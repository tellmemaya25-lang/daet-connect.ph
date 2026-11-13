"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";
import type { CoveragePackage } from "@/lib/tours/guide-coverage";
import { setPackageGuides, type AssignmentResult } from "./actions";

/** Tick the guides who lead this package; its bookings propose them first. */
export function PackageGuidesForm({ pkg, guides }: { pkg: CoveragePackage; guides: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set(pkg.guideIds));
  const [result, setResult] = useState<AssignmentResult | null>(null);
  const [pending, start] = useTransition();
  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <fieldset className="rounded-2xl bg-canvas p-4">
      <legend className="px-1 font-bold text-daet-ink">{pkg.title}</legend>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {pkg.operator} · {pkg.municipality ?? "No municipality set"}
      </p>
      {guides.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">No approved guides yet.</p>
      ) : (
        <div className="mt-2 grid grid-cols-1 gap-x-3 sm:grid-cols-2 lg:grid-cols-3">
          {guides.map((g) => (
            <label key={g.id} className="flex min-h-11 items-center gap-2 text-sm text-daet-ink">
              <Checkbox checked={picked.has(g.id)} onChange={() => toggle(g.id)} />
              {g.name}
            </label>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await setPackageGuides(pkg.id, guides.filter((g) => picked.has(g.id)).map((g) => g.id));
              setResult(r);
              if (r.ok) router.refresh();
            })
          }
        >
          Save guides
        </Button>
        {result ? (
          <p role="status" className={`text-sm font-semibold ${result.ok ? "text-green-800 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
            {result.message}
          </p>
        ) : null}
      </div>
    </fieldset>
  );
}
