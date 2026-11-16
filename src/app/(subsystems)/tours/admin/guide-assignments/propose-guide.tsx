"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { proposeGuide, type AssignmentResult } from "./actions";

/** Assign a guide by name, or let the system pick the best free one; the operator then approves. */
export function ProposeGuide({ bookingId, guides, current }: { bookingId: string; guides: Array<{ id: string; name: string }>; current: string | null }) {
  const router = useRouter();
  const [guideId, setGuideId] = useState(current ?? "");
  const [result, setResult] = useState<AssignmentResult | null>(null);
  const [pending, start] = useTransition();
  const run = (id: string | null) =>
    start(async () => {
      const r = await proposeGuide(bookingId, id);
      setResult(r);
      if (r.ok) router.refresh();
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm font-bold text-daet-ink">
          Guide
          <Select value={guideId} onChange={(e) => setGuideId(e.target.value)} className="w-52">
            <option value="">Choose a guide</option>
            {guides.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </label>
        <Button disabled={pending || !guideId} onClick={() => run(guideId)}>
          Assign
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => run(null)}>
          Assign automatically
        </Button>
      </div>
      {result ? (
        <p role="status" className={`text-sm font-semibold ${result.ok ? "text-green-800 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
