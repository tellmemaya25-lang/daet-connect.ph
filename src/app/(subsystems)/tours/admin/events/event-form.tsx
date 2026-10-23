"use client";

import Link from "next/link";
import { Notice } from "@/components/ui/notice";
import { usePromoForm } from "@/components/tours/use-promo-form";
import { PromoCheckbox, PromoField, PromoImageField, promoInputClass } from "@/components/tours/promo-fields";
import { isoToManilaLocal } from "@/lib/tours/events-calendar";
import { EVENT_CATEGORIES, type TourEvent } from "@/lib/tours/promo-validation";
import { saveEvent } from "./actions";

export function EventForm({ event }: { event?: TourEvent }) {
  const { state, pending, onSubmit } = usePromoForm(saveEvent);
  const errors = state.errors;
  const invalid = (field: string) => (errors[field] ? true : undefined);

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {event ? <input type="hidden" name="id" value={event.id} /> : null}

      {state.message ? <Notice variant="error">{state.message}</Notice> : null}

      <PromoField id="title" label="Event title" required error={errors.title}>
        <input id="title" name="title" defaultValue={event?.title} maxLength={120} required aria-invalid={invalid("title")} className={promoInputClass} />
      </PromoField>

      <div className="grid gap-5 sm:grid-cols-2">
        <PromoField id="category" label="Category" required error={errors.category}>
          <select id="category" name="category" defaultValue={event?.category ?? "festival"} aria-invalid={invalid("category")} className={promoInputClass}>
            {Object.entries(EVENT_CATEGORIES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </PromoField>
        <PromoField id="organizer" label="Organizer" error={errors.organizer}>
          <input id="organizer" name="organizer" defaultValue={event?.organizer ?? ""} maxLength={120} aria-invalid={invalid("organizer")} className={promoInputClass} placeholder="e.g. Daet Tourism Office" />
        </PromoField>
      </div>

      <PromoField id="venue" label="Venue" required error={errors.venue}>
        <input id="venue" name="venue" defaultValue={event?.venue} maxLength={160} required aria-invalid={invalid("venue")} className={promoInputClass} placeholder="e.g. Bagasbas Beach" />
      </PromoField>

      <div className="grid gap-5 sm:grid-cols-2">
        <PromoField id="startsAt" label="Starts" hint="Philippine time" required error={errors.startsAt}>
          <input id="startsAt" name="startsAt" type="datetime-local" defaultValue={event ? isoToManilaLocal(event.starts_at) : ""} required aria-invalid={invalid("startsAt")} className={promoInputClass} />
        </PromoField>
        <PromoField id="endsAt" label="Ends" hint="Philippine time" required error={errors.endsAt}>
          <input id="endsAt" name="endsAt" type="datetime-local" defaultValue={event ? isoToManilaLocal(event.ends_at) : ""} required aria-invalid={invalid("endsAt")} className={promoInputClass} />
        </PromoField>
      </div>

      <PromoField id="description" label="Description" error={errors.description}>
        <textarea id="description" name="description" defaultValue={event?.description ?? ""} rows={5} maxLength={2000} aria-invalid={invalid("description")} className={promoInputClass} />
      </PromoField>

      <PromoImageField currentUrl={event?.image_url ?? null} error={errors.image} />

      <PromoCheckbox name="isPublished" label="Publish on the public calendar" description="Unpublished events are only visible to admins." defaultChecked={event?.is_published ?? true} />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href="/tours/admin/events" className="inline-flex min-h-11 items-center justify-center rounded-full border border-daet-ink/20 px-6 text-sm font-bold text-daet-ink hover:bg-daet-sand">
          Cancel
        </Link>
        <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-full bg-daet-forest px-6 text-sm font-bold text-white hover:bg-daet-ink disabled:opacity-60">
          {pending ? "Saving…" : event ? "Save changes" : "Create event"}
        </button>
      </div>
    </form>
  );
}
