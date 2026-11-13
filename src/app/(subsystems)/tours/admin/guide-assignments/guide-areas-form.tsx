"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";
import { MUNICIPALITIES, type Municipality } from "@/lib/tours/municipalities";
import { setGuideAreas, type AssignmentResult } from "./actions";

/** Tick the towns a guide covers. */
export function GuideAreasForm({ guideId, name, areas }: { guideId: string; name: string; areas: Municipality[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<Municipality>>(new Set(areas));
  const [result, setResult] = useState<AssignmentResult | null>(null);
  const [pending, start] = useTransition();
  const toggle = (m: Municipality) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });

  return (
    <fieldset className="rounded-2xl bg-canvas p-4">
      <legend className="px-1 font-bold text-daet-ink">{name}</legend>
      <div className="mt-2 grid grid-cols-2 gap-x-3 sm:grid-cols-3 lg:grid-cols-4">
        {MUNICIPALITIES.map((m) => (
          <label key={m} className="flex min-h-11 items-center gap-2 text-sm text-daet-ink">
            <Checkbox checked={picked.has(m)} onChange={() => toggle(m)} />
            {m}
          </label>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await setGuideAreas(guideId, MUNICIPALITIES.filter((m) => picked.has(m)));
              setResult(r);
              if (r.ok) router.refresh();
            })
          }
        >
          Save areas
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
