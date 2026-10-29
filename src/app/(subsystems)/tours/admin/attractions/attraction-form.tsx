"use client";

import Link from "next/link";
import { Notice } from "@/components/ui/notice";
import { usePromoForm } from "@/components/tours/use-promo-form";
import { PromoCheckbox, PromoField, PromoImageField, promoInputClass } from "@/components/tours/promo-fields";
import { ATTRACTION_CATEGORIES, type Attraction } from "@/lib/tours/attractions";
import { hoursToText } from "@/lib/tours/opening-hours";
import { saveAttraction } from "./actions";

export function AttractionForm({ attraction }: { attraction?: Attraction }) {
  const { state, pending, onSubmit } = usePromoForm(saveAttraction);
  const errors = state.errors;
  const invalid = (field: string) => (errors[field] ? true : undefined);

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {attraction ? <input type="hidden" name="id" value={attraction.id} /> : null}
      {state.message ? <Notice variant="error">{state.message}</Notice> : null}

      <PromoField id="name" label="Name" required error={errors.name}>
        <input id="name" name="name" defaultValue={attraction?.name} maxLength={120} required aria-invalid={invalid("name")} className={promoInputClass} />
      </PromoField>

      <div className="grid gap-5 sm:grid-cols-2">
        <PromoField id="category" label="Category" required error={errors.category}>
          <select id="category" name="category" defaultValue={attraction?.category ?? "beach"} aria-invalid={invalid("category")} className={promoInputClass}>
            {Object.entries(ATTRACTION_CATEGORIES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </PromoField>
        <PromoField id="slug" label="Web address" hint="Leave empty to make one from the name." error={errors.slug}>
          <input id="slug" name="slug" defaultValue={attraction?.slug} maxLength={80} aria-invalid={invalid("slug")} className={promoInputClass} placeholder="bagasbas-beach" />
        </PromoField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <PromoField id="municipality" label="Municipality" error={errors.municipality}>
          <input id="municipality" name="municipality" defaultValue={attraction?.municipality ?? "Daet"} maxLength={60} aria-invalid={invalid("municipality")} className={promoInputClass} />
        </PromoField>
        <PromoField id="address" label="Address or landmark" error={errors.address}>
          <input id="address" name="address" defaultValue={attraction?.address ?? ""} maxLength={200} aria-invalid={invalid("address")} className={promoInputClass} />
        </PromoField>
      </div>

      <fieldset className="bg-slate-50 rounded-2xl p-4">
        <legend className="px-1 text-sm font-bold text-daet-ink">Map pin</legend>
        <p className="text-sm text-slate-600">In Google Maps, long-press the spot and copy the two numbers. Leave both empty if unknown.</p>
        <div className="mt-3 grid gap-5 sm:grid-cols-2">
          <PromoField id="latitude" label="Latitude" error={errors.latitude}>
            <input id="latitude" name="latitude" inputMode="decimal" defaultValue={attraction?.latitude ?? ""} aria-invalid={invalid("latitude")} className={promoInputClass} placeholder="14.1131" />
          </PromoField>
          <PromoField id="longitude" label="Longitude" error={errors.longitude}>
            <input id="longitude" name="longitude" inputMode="decimal" defaultValue={attraction?.longitude ?? ""} aria-invalid={invalid("longitude")} className={promoInputClass} placeholder="122.9545" />
          </PromoField>
        </div>
        <div className="mt-3">
          <PromoCheckbox name="locationVerified" label="Pin confirmed by the Tourism Office" description="Leave unchecked for pins taken from other sources." defaultChecked={attraction?.location_verified ?? false} />
        </div>
      </fieldset>

      <PromoField id="hours" label="Opening hours" hint='e.g. "Mon-Fri 08:00-17:00; Sat 09:00-12:00; Sun closed", "Daily 06:00-18:00" or "24/7". Leave empty if unknown.' error={errors.hours}>
        <input id="hours" name="hours" defaultValue={hoursToText(attraction?.opening_hours ?? null)} aria-invalid={invalid("hours")} className={promoInputClass} />
      </PromoField>
      <PromoField id="hoursNote" label="Hours note" error={errors.hoursNote}>
        <input id="hoursNote" name="hoursNote" defaultValue={attraction?.hours_note ?? ""} maxLength={200} aria-invalid={invalid("hoursNote")} className={promoInputClass} placeholder="e.g. Closed on holidays" />
      </PromoField>

      <div className="grid gap-5 sm:grid-cols-2">
        <PromoField id="dwellMinutes" label="Typical visit (minutes)" hint="Used by the itinerary planner." error={errors.dwellMinutes}>
          <input id="dwellMinutes" name="dwellMinutes" inputMode="numeric" defaultValue={attraction?.dwell_minutes ?? ""} aria-invalid={invalid("dwellMinutes")} className={promoInputClass} />
        </PromoField>
        <PromoField id="entranceFee" label="Entrance fee (₱)" hint="0 for free; empty if unknown." error={errors.entranceFee}>
          <input id="entranceFee" name="entranceFee" inputMode="decimal" defaultValue={attraction?.entrance_fee ?? ""} aria-invalid={invalid("entranceFee")} className={promoInputClass} />
        </PromoField>
      </div>

      <PromoField id="description" label="Description" error={errors.description}>
        <textarea id="description" name="description" defaultValue={attraction?.description ?? ""} rows={5} maxLength={2000} aria-invalid={invalid("description")} className={promoInputClass} />
      </PromoField>

      <PromoField id="source" label="Source" required hint="Where the details come from, e.g. Daet Municipal Tourism Office, Oct 2026." error={errors.source}>
        <input id="source" name="source" defaultValue={attraction?.source ?? ""} maxLength={500} required aria-invalid={invalid("source")} className={promoInputClass} />
      </PromoField>

      <PromoImageField currentUrl={attraction?.photo_url ?? null} error={errors.image} />

      <PromoCheckbox name="isActive" label="Show in the public directory" description="Hidden attractions stay visible to admins only." defaultChecked={attraction?.is_active ?? true} />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href="/tours/admin/attractions" className="inline-flex min-h-11 items-center justify-center rounded-full border border-daet-ink/20 px-6 text-sm font-bold text-daet-ink hover:bg-daet-sand">
          Cancel
        </Link>
        <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-full bg-daet-forest px-6 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
          {pending ? "Saving…" : attraction ? "Save changes" : "Add attraction"}
        </button>
      </div>
    </form>
  );
}
