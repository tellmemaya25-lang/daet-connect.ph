"use client";

import { ButtonLink, Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { usePromoForm } from "@/components/tours/use-promo-form";
import { PromoCheckbox } from "@/components/tours/promo-fields";
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

      <Field id="mode" label="How people travel" required error={errors.mode}>
        <Select id="mode" name="mode" defaultValue={fare?.mode ?? "tricycle"} aria-invalid={invalid("mode")}>
          {Object.entries(FARE_MODES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="fromName" label="From" required hint="e.g. Daet town center, Paracale port" error={errors.fromName}>
          <Input id="fromName" name="fromName" defaultValue={fare?.from_name} maxLength={80} required aria-invalid={invalid("fromName")} />
        </Field>
        <Field id="toName" label="To" required error={errors.toName}>
          <Input id="toName" name="toName" defaultValue={fare?.to_name} maxLength={80} required aria-invalid={invalid("toName")} />
        </Field>
      </div>

      <fieldset className="min-w-0">
        <legend className="p-0 text-sm font-bold text-daet-ink">Fare</legend>
        <p className="mt-1 text-sm text-daet-ink/75">Leave empty if unknown; the assistant then says to ask locally.</p>
        <div className="mt-3 grid gap-5 sm:grid-cols-3">
          <Field id="fareMin" label="Min fare (₱)" error={errors.fareMin}>
            <Input id="fareMin" name="fareMin" inputMode="decimal" defaultValue={fare?.fare_min ?? ""} aria-invalid={invalid("fareMin")} />
          </Field>
          <Field id="fareMax" label="Max fare (₱)" error={errors.fareMax}>
            <Input id="fareMax" name="fareMax" inputMode="decimal" defaultValue={fare?.fare_max ?? ""} aria-invalid={invalid("fareMax")} />
          </Field>
          <Field id="farePer" label="Fare is" error={errors.farePer}>
            <Select id="farePer" name="farePer" defaultValue={fare?.fare_per ?? "person"} aria-invalid={invalid("farePer")}>
              {Object.entries(FARE_PER).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="minutesMin" label="Shortest trip (minutes)" error={errors.minutesMin}>
          <Input id="minutesMin" name="minutesMin" inputMode="numeric" defaultValue={fare?.minutes_min ?? ""} aria-invalid={invalid("minutesMin")} />
        </Field>
        <Field id="minutesMax" label="Longest trip (minutes)" error={errors.minutesMax}>
          <Input id="minutesMax" name="minutesMax" inputMode="numeric" defaultValue={fare?.minutes_max ?? ""} aria-invalid={invalid("minutesMax")} />
        </Field>
      </div>

      <Field id="scheduleNote" label="Schedule and tips" hint="e.g. Boats leave 6–8 AM; agree on the fare first." error={errors.scheduleNote}>
        <Textarea id="scheduleNote" name="scheduleNote" defaultValue={fare?.schedule_note ?? ""} rows={2} maxLength={300} aria-invalid={invalid("scheduleNote")} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
        <Field id="source" label="Source" required error={errors.source}>
          <Input id="source" name="source" defaultValue={fare?.source ?? ""} maxLength={500} required aria-invalid={invalid("source")} />
        </Field>
        <Field id="checkedOn" label="Checked on" error={errors.checkedOn}>
          <Input id="checkedOn" name="checkedOn" type="date" defaultValue={fare?.checked_on ?? ""} aria-invalid={invalid("checkedOn")} />
        </Field>
      </div>

      <PromoCheckbox name="verified" label="Verified by the Tourism Office" description="Unverified fares are shown with a 'verify locally' note." defaultChecked={fare?.verified ?? false} />
      <PromoCheckbox name="isActive" label="Show to travellers" defaultChecked={fare?.is_active ?? true} />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <ButtonLink href="/tours/admin/fares" variant="ghost">Cancel</ButtonLink>
        <Button type="submit" loading={pending} loadingText="Saving…">{fare ? "Save changes" : "Add fare"}</Button>
      </div>
    </form>
  );
}
