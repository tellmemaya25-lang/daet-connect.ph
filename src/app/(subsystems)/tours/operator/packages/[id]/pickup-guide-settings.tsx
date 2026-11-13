"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { MAX_PICKUP_POINTS, type PickupDraft, type PickupPoint } from "@/lib/tours/pickup";
import { MUNICIPALITIES } from "@/lib/tours/municipalities";
import { saveGuideSettings, savePickupPoints, type SettingsResult } from "./pickup-actions";

const blank = (): PickupDraft => ({ name: "", fee: "", feePer: "booking", note: "" });

/**
 * Pickup points with their fees (added to the tourist's total), and the guide
 * settings: the fee the assigned guide earns per tour, and the municipality,
 * which decides which guides are proposed for this tour.
 */
export function PickupGuideSettings({
  packageId,
  points,
  guideFee,
  municipality,
  ready,
}: {
  packageId: string;
  points: PickupPoint[];
  guideFee: number | null;
  municipality: string | null;
  /** False until the database has the pickup and guide-fee columns. */
  ready: boolean;
}) {
  const [drafts, setDrafts] = useState<PickupDraft[]>(() =>
    points.length ? points.map((p) => ({ name: p.name, fee: p.fee ? String(p.fee) : "", feePer: p.feePer, note: p.note ?? "" })) : [blank()],
  );
  const [fee, setFee] = useState(guideFee === null ? "" : String(guideFee));
  const [area, setArea] = useState(municipality ?? "");
  const [pickupResult, setPickupResult] = useState<SettingsResult | null>(null);
  const [guideResult, setGuideResult] = useState<SettingsResult | null>(null);
  const [pending, start] = useTransition();

  const update = (index: number, patch: Partial<PickupDraft>) => setDrafts((list) => list.map((d, i) => (i === index ? { ...d, ...patch } : d)));

  if (!ready) {
    return <Notice variant="info">Pickup points and guide fees will be available after the next database update.</Notice>;
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="pickup-heading" className="space-y-3">
        <h3 id="pickup-heading" className="font-bold text-daet-ink">Pickup points</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Guests choose one when they book, and its fee is added to their total. Leave the fee empty for a free pickup. Guests can always choose to go to the meeting point instead.
        </p>
        {pickupResult ? <Notice variant={pickupResult.ok ? "success" : "error"}>{pickupResult.message}</Notice> : null}
        <ul className="space-y-3">
          {drafts.map((draft, i) => (
            <li key={i} className="grid gap-2 rounded-2xl bg-canvas p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
              <label className="text-sm font-bold text-daet-ink">
                Place
                <Input value={draft.name} maxLength={120} placeholder="e.g. Daet Plaza" onChange={(e) => update(i, { name: e.target.value })} />
              </label>
              <label className="text-sm font-bold text-daet-ink">
                Fee (₱)
                <Input
                  value={draft.fee}
                  inputMode="decimal"
                  placeholder="0"
                  onChange={(e) => update(i, { fee: e.target.value.replace(/[^\d.]/g, "") })}
                />
              </label>
              <label className="text-sm font-bold text-daet-ink">
                Charged
                <Select value={draft.feePer} onChange={(e) => update(i, { feePer: e.target.value === "person" ? "person" : "booking" })}>
                  <option value="booking">per booking</option>
                  <option value="person">per person</option>
                </Select>
              </label>
              <Button variant="ghost" onClick={() => setDrafts((list) => (list.length === 1 ? [blank()] : list.filter((_, j) => j !== i)))} aria-label={`Remove pickup point ${i + 1}`}>
                Remove
              </Button>
              <label className="text-sm font-bold text-daet-ink sm:col-span-4">
                Note for guests (optional)
                <Input value={draft.note} maxLength={300} placeholder="e.g. In front of the church, 5:30 AM" onChange={(e) => update(i, { note: e.target.value })} />
              </label>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={drafts.length >= MAX_PICKUP_POINTS} onClick={() => setDrafts((list) => [...list, blank()])}>
            Add a pickup point
          </Button>
          <Button disabled={pending} onClick={() => start(async () => setPickupResult(await savePickupPoints(packageId, drafts)))}>
            Save pickup points
          </Button>
        </div>
      </section>

      <section aria-labelledby="guide-heading" className="space-y-3">
        <h3 id="guide-heading" className="font-bold text-daet-ink">Guide fee and area</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          The guide fee is what the assigned guide earns for this tour; it is counted in your earnings and theirs. The municipality decides which guides are proposed for new bookings.
        </p>
        {guideResult ? <Notice variant={guideResult.ok ? "success" : "error"}>{guideResult.message}</Notice> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold text-daet-ink">
            Guide fee per tour (₱)
            <Input value={fee} inputMode="decimal" placeholder="e.g. 800" onChange={(e) => setFee(e.target.value.replace(/[^\d.,]/g, ""))} />
          </label>
          <label className="text-sm font-bold text-daet-ink">
            Municipality
            <Select value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">Not set (no automatic guide)</option>
              {MUNICIPALITIES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <Button disabled={pending} onClick={() => start(async () => setGuideResult(await saveGuideSettings(packageId, fee, area)))}>
          Save guide settings
        </Button>
      </section>
    </div>
  );
}
