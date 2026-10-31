"use client";

import Link from "next/link";
import { Notice } from "@/components/ui/notice";
import { usePromoForm } from "@/components/tours/use-promo-form";
import { PromoCheckbox, PromoField, promoInputClass } from "@/components/tours/promo-fields";
import { GUIDE_PLACE_KINDS, PRICE_UNITS, type GuidePlace } from "@/lib/tours/guide/places";
import { hoursToText } from "@/lib/tours/opening-hours";
import { saveGuidePlace } from "./actions";

export function GuidePlaceForm({ place }: { place?: GuidePlace }) {
  const { state, pending, onSubmit } = usePromoForm(saveGuidePlace);
  const errors = state.errors;
  const invalid = (field: string) => (errors[field] ? true : undefined);

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {place ? <input type="hidden" name="id" value={place.id} /> : null}
      {state.message ? <Notice variant="error">{state.message}</Notice> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <PromoField id="kind" label="Kind of place" required error={errors.kind}>
          <select id="kind" name="kind" defaultValue={place?.kind ?? "eatery"} aria-invalid={invalid("kind")} className={promoInputClass}>
            {Object.entries(GUIDE_PLACE_KINDS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </PromoField>
        <PromoField id="name" label="Name" required error={errors.name}>
          <input id="name" name="name" defaultValue={place?.name} maxLength={120} required aria-invalid={invalid("name")} className={promoInputClass} />
        </PromoField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <PromoField id="municipality" label="Municipality" error={errors.municipality}>
          <input id="municipality" name="municipality" defaultValue={place?.municipality ?? "Daet"} maxLength={60} aria-invalid={invalid("municipality")} className={promoInputClass} />
        </PromoField>
        <PromoField id="address" label="Address or landmark" error={errors.address}>
          <input id="address" name="address" defaultValue={place?.address ?? ""} maxLength={200} aria-invalid={invalid("address")} className={promoInputClass} />
        </PromoField>
      </div>

      <fieldset className="rounded-2xl bg-canvas p-4">
        <legend className="px-1 font-bold text-daet-ink">Map pin</legend>
        <p className="text-sm text-slate-600 dark:text-slate-400">Without a pin, directions search Google Maps by the name and municipality.</p>
        <div className="mt-3 grid gap-5 sm:grid-cols-2">
          <PromoField id="latitude" label="Latitude" error={errors.latitude}>
            <input id="latitude" name="latitude" inputMode="decimal" defaultValue={place?.latitude ?? ""} aria-invalid={invalid("latitude")} className={promoInputClass} placeholder="14.1131" />
          </PromoField>
          <PromoField id="longitude" label="Longitude" error={errors.longitude}>
            <input id="longitude" name="longitude" inputMode="decimal" defaultValue={place?.longitude ?? ""} aria-invalid={invalid("longitude")} className={promoInputClass} placeholder="122.9545" />
          </PromoField>
        </div>
        <div className="mt-3">
          <PromoCheckbox name="locationVerified" label="Pin confirmed by the Tourism Office" defaultChecked={place?.location_verified ?? false} />
        </div>
      </fieldset>

      <fieldset className="rounded-2xl bg-canvas p-4">
        <legend className="px-1 font-bold text-daet-ink">Price</legend>
        <p className="text-sm text-slate-600 dark:text-slate-400">Used for trip cost estimates. Leave empty if unknown; the assistant then says to ask locally.</p>
        <div className="mt-3 grid gap-5 sm:grid-cols-3">
          <PromoField id="priceMin" label="From (₱)" error={errors.priceMin}>
            <input id="priceMin" name="priceMin" inputMode="decimal" defaultValue={place?.price_min ?? ""} aria-invalid={invalid("priceMin")} className={promoInputClass} />
          </PromoField>
          <PromoField id="priceMax" label="Up to (₱)" error={errors.priceMax}>
            <input id="priceMax" name="priceMax" inputMode="decimal" defaultValue={place?.price_max ?? ""} aria-invalid={invalid("priceMax")} className={promoInputClass} />
          </PromoField>
          <PromoField id="priceUnit" label="Price is" error={errors.priceUnit}>
            <select id="priceUnit" name="priceUnit" defaultValue={place?.price_unit ?? ""} aria-invalid={invalid("priceUnit")} className={promoInputClass}>
              <option value="">Not set</option>
              {Object.entries(PRICE_UNITS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </PromoField>
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <PromoField id="specialties" label="Known for" hint="Separate with commas, e.g. Bicol express, sinantolan" error={errors.specialties}>
          <input id="specialties" name="specialties" defaultValue={place?.specialties.join(", ") ?? ""} className={promoInputClass} />
        </PromoField>
        <PromoField id="tags" label="Tags" hint="e.g. family, vegetarian, wifi, parking" error={errors.tags}>
          <input id="tags" name="tags" defaultValue={place?.tags.join(", ") ?? ""} className={promoInputClass} />
        </PromoField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <PromoField id="hours" label="Opening hours" hint='e.g. "Daily 07:00-21:00". Leave empty if unknown.' error={errors.hours}>
          <input id="hours" name="hours" defaultValue={hoursToText(place?.opening_hours ?? null)} aria-invalid={invalid("hours")} className={promoInputClass} />
        </PromoField>
        <PromoField id="phone" label="Phone" error={errors.phone}>
          <input id="phone" name="phone" type="tel" defaultValue={place?.phone ?? ""} maxLength={40} aria-invalid={invalid("phone")} className={promoInputClass} />
        </PromoField>
      </div>

      <PromoField id="description" label="Description" error={errors.description}>
        <textarea id="description" name="description" defaultValue={place?.description ?? ""} rows={3} maxLength={1000} aria-invalid={invalid("description")} className={promoInputClass} />
      </PromoField>

      <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
        <PromoField id="source" label="Source" required hint="Where the details come from." error={errors.source}>
          <input id="source" name="source" defaultValue={place?.source ?? ""} maxLength={500} required aria-invalid={invalid("source")} className={promoInputClass} />
        </PromoField>
        <PromoField id="checkedOn" label="Checked on" error={errors.checkedOn}>
          <input id="checkedOn" name="checkedOn" type="date" defaultValue={place?.checked_on ?? ""} aria-invalid={invalid("checkedOn")} className={promoInputClass} />
        </PromoField>
      </div>

      <PromoCheckbox name="verified" label="Verified by the Tourism Office" description="Unverified places are shown with a 'verify locally' note." defaultChecked={place?.verified ?? false} />
      <PromoCheckbox name="isActive" label="Show to travellers" defaultChecked={place?.is_active ?? true} />
      <input type="hidden" name="slug" value={place?.slug ?? ""} />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href="/tours/admin/guide-places" className="inline-flex min-h-11 items-center justify-center rounded-full bg-muted px-6 font-bold text-daet-ink hover:bg-muted-strong">
          Cancel
        </Link>
        <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-full bg-blue-600 px-6 font-bold text-white hover:bg-blue-700 disabled:opacity-60">
          {pending ? "Saving…" : place ? "Save changes" : "Add place"}
        </button>
      </div>
    </form>
  );
}
