"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { formatPeso } from "@/lib/money";
import { UNIT_LABEL, type AddonUnit } from "@/lib/tours/quote";
import type { TripDetails } from "@/lib/tours/trip-details";
import type { TripDetailsInput } from "@/lib/tours/trip-details-form";
import { saveTripDetails } from "./actions";

type Variant = { id: string; variant_name: string; price_per_pax: number | null; flat_price: number | null };

const str = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const blankStep = (day: number) => ({ day_number: day, start_time: "", activity: "" });
const blankExtra = { name: "", price: "", unit: "per_booking", max_guests: "", needs_reservation: false, bookable: true, note: "" };
const UNITS = Object.keys(UNIT_LABEL) as AddonUnit[];

export function TripDetailsForm({
  packageId,
  details,
  variants,
  days,
  full,
  readOnly,
}: {
  packageId: string;
  details: TripDetails;
  variants: Variant[];
  days: number;
  full: boolean;
  readOnly: boolean;
}) {
  const [itinerary, setItinerary] = useState<TripDetailsInput["itinerary"]>(
    details.itinerary.length ? details.itinerary.map((r) => ({ day_number: r.day_number, start_time: r.start_time ?? "", activity: r.activity })) : [blankStep(1)],
  );
  const [thingsToBring, setThingsToBring] = useState(details.thingsToBring.join("\n"));
  const [goodToKnow, setGoodToKnow] = useState(details.goodToKnow ?? "");
  const [addons, setAddons] = useState<TripDetailsInput["addons"]>(
    details.addons.map((a) => ({ name: a.name, price: String(a.price), unit: a.unit, max_guests: str(a.max_guests), needs_reservation: a.needs_reservation, bookable: a.bookable, note: a.note ?? "" })),
  );
  const [depositPerPax, setDepositPerPax] = useState(str(details.depositPerPax));
  const [depositRefundable, setDepositRefundable] = useState(details.depositRefundable);
  const [cancellationPolicy, setCancellationPolicy] = useState(details.cancellationPolicy ?? "");
  const [rules, setRules] = useState<TripDetailsInput["variantRules"]>(
    variants.map((v) => {
      const r = details.rules[v.id];
      return { variant_id: v.id, child_max_age: str(r?.child_max_age), child_price_percent: str(r?.child_price_percent), group_min_pax: str(r?.group_min_pax), group_discount_per_pax: str(r?.group_discount_per_pax), group_free_pax: str(r?.group_free_pax) };
    }),
  );
  const [result, setResult] = useState<{ ok: boolean; message: string; errors: Record<string, string> } | null>(null);
  const [pending, startTransition] = useTransition();
  const errors = result?.errors ?? {};
  const moneyLocked = readOnly || !full;
  const dayOptions = Array.from({ length: Math.max(days, ...itinerary.map((r) => Number(r.day_number) || 1)) }, (_, i) => i + 1);

  const patch = <T,>(list: T[], i: number, change: Partial<T>) => list.map((row, j) => (j === i ? { ...row, ...change } : row));

  function save() {
    startTransition(async () => {
      const response = await saveTripDetails(packageId, { itinerary, thingsToBring, goodToKnow, addons, depositPerPax, depositRefundable, cancellationPolicy, variantRules: rules }, full);
      setResult(response);
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      className="space-y-6"
    >
      <fieldset disabled={readOnly || pending} className="space-y-6">
        <Card>
          <CardHeader title="Day by day" description="What happens when, for each day. Leave the time empty for loose plans." />
          <ol className="space-y-3">
            {itinerary.map((row, i) => (
              <li key={i} className="rounded-2xl bg-canvas p-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-[6rem_8rem_1fr_auto] sm:items-end">
                  <Field id={`day-${i}`} label="Day">
                    <Select id={`day-${i}`} value={row.day_number} onChange={(e) => setItinerary((list) => patch(list, i, { day_number: Number(e.target.value) }))}>
                      {dayOptions.map((d) => (
                        <option key={d} value={d}>Day {d}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field id={`time-${i}`} label="Time">
                    <Input id={`time-${i}`} value={row.start_time} placeholder="6:00 AM" maxLength={20} onChange={(e) => setItinerary((list) => patch(list, i, { start_time: e.target.value }))} />
                  </Field>
                  <Field id={`activity-${i}`} label="What happens" error={errors[`itinerary.${i}`]} className="col-span-2 sm:col-span-1">
                    <Input id={`activity-${i}`} value={row.activity} maxLength={300} onChange={(e) => setItinerary((list) => patch(list, i, { activity: e.target.value }))} />
                  </Field>
                  <Button variant="ghost" className="col-span-2 sm:col-span-1" aria-label={`Remove step ${i + 1}`} onClick={() => setItinerary((list) => list.filter((_, j) => j !== i))}>
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          <Button variant="secondary" className="mt-3" onClick={() => setItinerary((list) => [...list, blankStep(Number(list.at(-1)?.day_number ?? 1))])}>
            Add a step
          </Button>
        </Card>

        <Card>
          <CardHeader title="Good to know" />
          <div className="space-y-4">
            <Field id="things" label="Things to bring" hint="One per line." error={errors.thingsToBring}>
              <Textarea id="things" rows={6} value={thingsToBring} onChange={(e) => setThingsToBring(e.target.value)} />
            </Field>
            <Field id="notes" label="Notes for travellers" hint="Electricity, tides, safety, anything guests should know. One point per line." error={errors.goodToKnow}>
              <Textarea id="notes" rows={5} maxLength={2000} value={goodToKnow} onChange={(e) => setGoodToKnow(e.target.value)} />
            </Field>
          </div>
        </Card>
      </fieldset>

      <fieldset disabled={moneyLocked || pending} className="space-y-6">
        <Card>
          <CardHeader title="Optional extras" description="Upgrades guests can add when booking, or that you list for information and charge on site." />
          <ul className="space-y-3">
            {addons.map((a, i) => (
              <li key={i} className="rounded-2xl bg-canvas p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field id={`addon-name-${i}`} label="Name" error={errors[`addons.${i}`]}>
                    <Input id={`addon-name-${i}`} value={a.name} maxLength={120} onChange={(e) => setAddons((list) => patch(list, i, { name: e.target.value }))} />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field id={`addon-price-${i}`} label="Price (₱)">
                      <Input id={`addon-price-${i}`} inputMode="decimal" value={a.price} onChange={(e) => setAddons((list) => patch(list, i, { price: e.target.value }))} />
                    </Field>
                    <Field id={`addon-unit-${i}`} label="Charged">
                      <Select id={`addon-unit-${i}`} value={a.unit} onChange={(e) => setAddons((list) => patch(list, i, { unit: e.target.value }))}>
                        {UNITS.map((u) => (
                          <option key={u} value={u}>{UNIT_LABEL[u]}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field id={`addon-guests-${i}`} label="Up to how many guests (optional)">
                    <Input id={`addon-guests-${i}`} inputMode="numeric" value={a.max_guests} onChange={(e) => setAddons((list) => patch(list, i, { max_guests: e.target.value }))} />
                  </Field>
                  <Field id={`addon-note-${i}`} label="Note (optional)">
                    <Input id={`addon-note-${i}`} value={a.note} maxLength={300} placeholder="e.g. Price changes on holidays" onChange={(e) => setAddons((list) => patch(list, i, { note: e.target.value }))} />
                  </Field>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
                  <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-daet-ink">
                    <input type="checkbox" checked={a.bookable} onChange={(e) => setAddons((list) => patch(list, i, { bookable: e.target.checked }))} className="h-5 w-5 accent-blue-600" />
                    Guests can add it when booking
                  </label>
                  <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-daet-ink">
                    <input type="checkbox" checked={a.needs_reservation} onChange={(e) => setAddons((list) => patch(list, i, { needs_reservation: e.target.checked }))} className="h-5 w-5 accent-blue-600" />
                    You confirm it first
                  </label>
                  <Button variant="ghost" className="ml-auto" onClick={() => setAddons((list) => list.filter((_, j) => j !== i))}>
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <Button variant="secondary" className="mt-3" onClick={() => setAddons((list) => [...list, { ...blankExtra }])}>
            Add an extra
          </Button>
        </Card>

        <Card>
          <CardHeader title="Children and groups" description="Optional, per price option." />
          <ul className="space-y-3">
            {variants.map((v, i) => (
              <li key={v.id} className="rounded-2xl bg-canvas p-3">
                <p className="font-bold text-daet-ink">
                  {v.variant_name} <span className="font-normal text-daet-ink/75">· {formatPeso(v.price_per_pax ?? v.flat_price ?? 0)} {v.price_per_pax != null ? "per person" : "for the group"}</span>
                </p>
                {errors[`rules.${i}`] ? <p role="alert" className="mt-1 text-sm font-semibold text-red-700 dark:text-red-300">{errors[`rules.${i}`]}</p> : null}
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <Field id={`child-age-${i}`} label="Child up to age">
                    <Input id={`child-age-${i}`} inputMode="numeric" disabled={v.price_per_pax == null} value={rules[i].child_max_age} onChange={(e) => setRules((list) => patch(list, i, { child_max_age: e.target.value }))} />
                  </Field>
                  <Field id={`child-pct-${i}`} label="Child pays (%)">
                    <Input id={`child-pct-${i}`} inputMode="numeric" disabled={v.price_per_pax == null} value={rules[i].child_price_percent} onChange={(e) => setRules((list) => patch(list, i, { child_price_percent: e.target.value }))} />
                  </Field>
                  <Field id={`group-min-${i}`} label="Group from">
                    <Input id={`group-min-${i}`} inputMode="numeric" disabled={v.price_per_pax == null} value={rules[i].group_min_pax} onChange={(e) => setRules((list) => patch(list, i, { group_min_pax: e.target.value }))} />
                  </Field>
                  <Field id={`group-off-${i}`} label="₱ off each">
                    <Input id={`group-off-${i}`} inputMode="decimal" disabled={v.price_per_pax == null} value={rules[i].group_discount_per_pax} onChange={(e) => setRules((list) => patch(list, i, { group_discount_per_pax: e.target.value }))} />
                  </Field>
                  <Field id={`group-free-${i}`} label="Free guests">
                    <Input id={`group-free-${i}`} inputMode="numeric" disabled={v.price_per_pax == null} value={rules[i].group_free_pax} onChange={(e) => setRules((list) => patch(list, i, { group_free_pax: e.target.value }))} />
                  </Field>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Reservation and cancellation" />
          <div className="space-y-4">
            <Field id="deposit" label="Reservation fee per person (₱, optional)" hint="Taken off the total. Guests can pay it first and the rest later." error={errors.depositPerPax}>
              <Input id="deposit" inputMode="decimal" value={depositPerPax} onChange={(e) => setDepositPerPax(e.target.value)} />
            </Field>
            <label className="inline-flex min-h-11 items-center gap-2 font-semibold text-daet-ink">
              <input type="checkbox" checked={!depositRefundable} onChange={(e) => setDepositRefundable(!e.target.checked)} className="h-5 w-5 accent-blue-600" />
              The reservation fee is not refundable
            </label>
            <Field id="policy" label="Your cancellation terms" hint="Shown on the package and booking pages." error={errors.cancellationPolicy}>
              <Textarea id="policy" rows={3} maxLength={1000} value={cancellationPolicy} onChange={(e) => setCancellationPolicy(e.target.value)} />
            </Field>
          </div>
        </Card>
      </fieldset>

      {result ? (
        <Notice variant={result.ok ? "success" : "error"} title={result.ok ? undefined : "Not saved"}>
          {result.message}
        </Notice>
      ) : null}
      {!readOnly ? (
        <Button type="submit" size="lg" loading={pending} loadingText="Saving…">
          Save trip details
        </Button>
      ) : null}
    </form>
  );
}
