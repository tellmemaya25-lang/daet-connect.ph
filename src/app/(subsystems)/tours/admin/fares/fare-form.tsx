"use client";

import Link from "next/link";
import { Notice } from "@/components/ui/notice";
import { usePromoForm } from "@/components/tours/use-promo-form";
import { PromoCheckbox, PromoField, promoInputClass } from "@/components/tours/promo-fields";
import { FARE_MODES, FARE_PER, type Fare } from "@/lib/tours/guide/fares";
import { saveFare } from "./actions";

export function FareForm({ fare }: { fare?: Fare }) {
  const { state, pending, onSubmit } = usePromoForm(saveFare);
  const errors = state.errors;
  const invalid = (field: string) => (errors[field] ? true : undefined);

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {fare ? <input type="hidden" name="id" value={fare.id} /> : null}
      {state.message ? <Notice variant="error">{state.message}</Notice> : null}

      <PromoField id="mode" label="How people travel" required error={errors.mode}>
        <select id="mode" name="mode" defaultValue={fare?.mode ?? "tricycle"} aria-invalid={invalid("mode")} className={promoInputClass}>
          {Object.entries(FARE_MODES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </PromoField>

      <div className="grid gap-5 sm:grid-cols-2">
        <PromoField id="fromName" label="From" required hint="e.g. Daet town center, Paracale port" error={errors.fromName}>
          <input id="fromName" name="fromName" defaultValue={fare?.from_name} maxLength={80} required aria-invalid={invalid("fromName")} className={promoInputClass} />
        </PromoField>
        <PromoField id="toName" label="To" required error={errors.toName}>
          <input id="toName" name="toName" defaultValue={fare?.to_name} maxLength={80} required aria-invalid={invalid("toName")} className={promoInputClass} />
        </PromoField>
      </div>

      <fieldset className="rounded-2xl bg-slate-50 p-4">
        <legend className="px-1 font-bold text-daet-ink">Fare</legend>
        <p className="text-sm text-slate-600">Leave empty if unknown; the assistant then says to ask locally.</p>
        <div className="mt-3 grid gap-5 sm:grid-cols-3">
          <PromoField id="fareMin" label="From (₱)" error={errors.fareMin}>
            <input id="fareMin" name="fareMin" inputMode="decimal" defaultValue={fare?.fare_min ?? ""} aria-invalid={invalid("fareMin")} className={promoInputClass} />
          </PromoField>
          <PromoField id="fareMax" label="Up to (₱)" error={errors.fareMax}>
            <input id="fareMax" name="fareMax" inputMode="decimal" defaultValue={fare?.fare_max ?? ""} aria-invalid={invalid("fareMax")} className={promoInputClass} />
          </PromoField>
          <PromoField id="farePer" label="Fare is" error={errors.farePer}>
            <select id="farePer" name="farePer" defaultValue={fare?.fare_per ?? "person"} aria-invalid={invalid("farePer")} className={promoInputClass}>
              {Object.entries(FARE_PER).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </PromoField>
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <PromoField id="minutesMin" label="Shortest trip (minutes)" error={errors.minutesMin}>
          <input id="minutesMin" name="minutesMin" inputMode="numeric" defaultValue={fare?.minutes_min ?? ""} aria-invalid={invalid("minutesMin")} className={promoInputClass} />
        </PromoField>
        <PromoField id="minutesMax" label="Longest trip (minutes)" error={errors.minutesMax}>
          <input id="minutesMax" name="minutesMax" inputMode="numeric" defaultValue={fare?.minutes_max ?? ""} aria-invalid={invalid("minutesMax")} className={promoInputClass} />
        </PromoField>
      </div>

      <PromoField id="scheduleNote" label="Schedule and tips" hint="e.g. Boats leave 6–8 AM; agree on the fare first." error={errors.scheduleNote}>
        <textarea id="scheduleNote" name="scheduleNote" defaultValue={fare?.schedule_note ?? ""} rows={2} maxLength={300} aria-invalid={invalid("scheduleNote")} className={promoInputClass} />
      </PromoField>

      <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
        <PromoField id="source" label="Source" required error={errors.source}>
          <input id="source" name="source" defaultValue={fare?.source ?? ""} maxLength={500} required aria-invalid={invalid("source")} className={promoInputClass} />
        </PromoField>
        <PromoField id="checkedOn" label="Checked on" error={errors.checkedOn}>
          <input id="checkedOn" name="checkedOn" type="date" defaultValue={fare?.checked_on ?? ""} aria-invalid={invalid("checkedOn")} className={promoInputClass} />
        </PromoField>
      </div>

      <PromoCheckbox name="verified" label="Verified by the Tourism Office" description="Unverified fares are shown with a 'verify locally' note." defaultChecked={fare?.verified ?? false} />
      <PromoCheckbox name="isActive" label="Show to travellers" defaultChecked={fare?.is_active ?? true} />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href="/tours/admin/fares" className="inline-flex min-h-11 items-center justify-center rounded-full bg-slate-100 px-6 font-bold text-daet-ink hover:bg-slate-200">
          Cancel
        </Link>
        <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-full bg-blue-600 px-6 font-bold text-white hover:bg-blue-700 disabled:opacity-60">
          {pending ? "Saving…" : fare ? "Save changes" : "Add fare"}
        </button>
      </div>
    </form>
  );
}
