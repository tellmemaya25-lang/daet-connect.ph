"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { saveGuideSettings, type SettingsResult } from "./pickup-actions";

/**
 * The guide settings: the fee the assigned guide earns per tour, and the municipality,
 * which decides which guides are proposed for this tour.
 */
export function PickupGuideSettings({
  packageId,
  guideFee,
  municipality,
  ready,
}: {
  packageId: string;
  guideFee: number | null;
  municipality: string | null;
  /** False until the database has the pickup and guide-fee columns. */
  ready: boolean;
}) {
  const [fee, setFee] = useState(guideFee === null ? "" : String(guideFee));
  // Tours are in Daet; the saved municipality is kept as it is and no longer decides guides.
  const area = municipality ?? "";
  const [guideResult, setGuideResult] = useState<SettingsResult | null>(null);
  const [pending, start] = useTransition();

  if (!ready) {
    return <Notice variant="info">Guide fees will be available after the next database update.</Notice>;
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="guide-heading" className="space-y-3">
        <h3 id="guide-heading" className="font-bold text-daet-ink">Guide fee</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Guides on your team earn the share of the tour price you agreed with them (set on Guides). This fixed fee only applies to a guide who has no agreed share yet.
        </p>
        {guideResult ? <Notice variant={guideResult.ok ? "success" : "error"}>{guideResult.message}</Notice> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold text-daet-ink">
            Fixed guide fee, if no share is agreed (₱)
            <Input value={fee} inputMode="decimal" placeholder="e.g. 800" onChange={(e) => setFee(e.target.value.replace(/[^\d.,]/g, ""))} />
          </label>
        </div>
        <Button disabled={pending} onClick={() => start(async () => setGuideResult(await saveGuideSettings(packageId, fee, area)))}>
          Save guide settings
        </Button>
      </section>
    </div>
  );
}
