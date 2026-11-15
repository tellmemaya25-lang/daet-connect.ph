"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { formatPeso } from "@/lib/money";
import { MAX_PICKUP_VEHICLES, PICKUP_VEHICLES, type OfficialRate, type PickupVehicle, type VehicleDraft } from "@/lib/tours/door-pickup";
import { saveDoorPickupVehicles, type SettingsResult } from "./pickup-actions";

const blank = (): VehicleDraft => ({ vehicle: "", label: "", seats: "", maxKm: "15" });
const toDraft = (v: PickupVehicle): VehicleDraft => ({ vehicle: v.vehicle, label: v.label ?? "", seats: String(v.seats), maxKm: String(v.maxKm) });

/**
 * Door pickup ("pasundo"): the vehicles this tour can send to where a guest is,
 * priced by the official fare for its type (never by the operator). Only
 * types with an official fare can be listed. Empty list = no door pickup.
 */
export function DoorPickupSettings({ packageId, vehicles, rates, hasMeetingPin }: { packageId: string; vehicles: PickupVehicle[]; rates: OfficialRate[]; hasMeetingPin: boolean }) {
  const [drafts, setDrafts] = useState<VehicleDraft[]>(() => (vehicles.length ? vehicles.map(toDraft) : [blank()]));
  const [result, setResult] = useState<SettingsResult | null>(null);
  const [pending, start] = useTransition();
  const update = (i: number, patch: Partial<VehicleDraft>) => setDrafts((d) => d.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <section aria-labelledby="door-pickup-heading" className="space-y-3">
      <h3 id="door-pickup-heading" className="font-bold text-daet-ink">Door pickup (pasundo)</h3>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Set the one vehicle you send for guests who want a pickup; you bring them to the meeting point. You don&apos;t set the price: the fee is the official fare for the vehicle, per person, for the distance by road from their pin to the meeting point, and it is added to their total.
      </p>
      {rates.length ? (
        <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
          {rates.map((r) => (
            <li key={r.vehicle}>
              <span className="font-bold text-daet-ink">{PICKUP_VEHICLES[r.vehicle]}:</span> {r.baseFee > 0 ? `${formatPeso(r.baseFee)} + ` : ""}
              {formatPeso(r.perKmPerPerson)}/km per person. Source: {r.source}
              {r.effectiveOn ? `, from ${r.effectiveOn}` : ""} (checked {r.checkedOn}).
            </li>
          ))}
        </ul>
      ) : (
        <Notice variant="warning">No vehicle has an official fare yet, so door pickup can&apos;t be offered.</Notice>
      )}
      {hasMeetingPin ? null : <Notice variant="warning">Pin the meeting point on the map above first: door pickup is priced from it.</Notice>}
      {result ? <Notice variant={result.ok ? "success" : "error"}>{result.message}</Notice> : null}
      <ul className="space-y-3">
        {drafts.map((d, i) => (
          <li key={i} className="grid gap-2 rounded-2xl border border-line p-3 sm:grid-cols-4">
            <label className="text-sm font-bold text-daet-ink sm:col-span-2">
              Pickup vehicle
              <Select value={d.vehicle} onChange={(e) => update(i, { vehicle: e.target.value })}>
                <option value="">Choose…</option>
                {rates.map((r) => (
                  <option key={r.vehicle} value={r.vehicle}>
                    {PICKUP_VEHICLES[r.vehicle]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm font-bold text-daet-ink">
              Seats
              <Input inputMode="numeric" value={d.seats} placeholder="3" onChange={(e) => update(i, { seats: e.target.value.replace(/\D/g, "") })} />
            </label>
            <label className="text-sm font-bold text-daet-ink">
              Up to (km)
              <Input inputMode="decimal" value={d.maxKm} placeholder="15" onChange={(e) => update(i, { maxKm: e.target.value.replace(/[^\d.]/g, "") })} />
            </label>
            <label className="text-sm font-bold text-daet-ink sm:col-span-3">
              Name shown to guests (optional)
              <Input value={d.label} maxLength={80} placeholder="e.g. Aircon van" onChange={(e) => update(i, { label: e.target.value })} />
            </label>
            <div className="flex items-end">
              <Button type="button" variant="ghost" onClick={() => setDrafts((all) => all.filter((_, j) => j !== i))} aria-label="Turn off door pickup">
                Turn off
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {drafts.length < MAX_PICKUP_VEHICLES ? (
          <Button type="button" variant="secondary" onClick={() => setDrafts((d) => [...d, blank()])}>
            Add a vehicle
          </Button>
        ) : null}
        <Button type="button" disabled={pending} onClick={() => start(async () => setResult(await saveDoorPickupVehicles(packageId, drafts)))}>
          Save pickup vehicle
        </Button>
      </div>
    </section>
  );
}
