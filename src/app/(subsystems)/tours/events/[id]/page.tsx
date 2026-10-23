import Link from "next/link";
import { notFound } from "next/navigation";
import { PageFrame } from "@/components/ui/page-frame";
import { EVENT_CATEGORY_STYLES } from "@/components/tours/event-card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatEventRange, toManilaDateKey } from "@/lib/tours/events-calendar";
import { EVENT_CATEGORIES, EVENT_COLUMNS, type TourEvent } from "@/lib/tours/promo-validation";

export const dynamic = "force-dynamic";

async function loadEvent(id: string): Promise<TourEvent | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("tours_events")
    .select(EVENT_COLUMNS)
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle();
  return (data as TourEvent | null) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const event = await loadEvent((await params).id);
  return event ? { title: event.title, description: event.description ?? undefined } : { title: "Event not found" };
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await loadEvent(id);
  if (!event) notFound();

  const dayKey = toManilaDateKey(event.starts_at);
  const isPast = Date.parse(event.ends_at) < Date.now();
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${event.venue}, Daet, Camarines Norte`)}`;

  return (
    <PageFrame>
      <div className="mx-auto max-w-3xl">
        <Link href={`/tours/events?month=${dayKey.slice(0, 7)}&day=${dayKey}`} className="inline-flex min-h-11 items-center text-sm font-bold text-daet-forest hover:underline">
          ← Back to calendar
        </Link>

        <article className="overflow-hidden rounded-2xl border border-daet-ink/10 bg-white shadow-sm">
          <div className="aspect-video bg-gradient-to-br from-daet-forest to-daet-leaf">
            {event.image_url ? (
              <img src={event.image_url} alt={event.title} className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center text-6xl" aria-hidden="true">🎉</div>
            )}
          </div>
          <div className="p-5 sm:p-8">
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${EVENT_CATEGORY_STYLES[event.category].chip}`}>
                {EVENT_CATEGORIES[event.category]}
              </span>
              {isPast ? <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">This event has ended</span> : null}
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-daet-ink">{event.title}</h1>

            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex gap-3">
                <dt className="w-6 shrink-0" aria-label="When">🗓️</dt>
                <dd className="font-semibold text-daet-ink">{formatEventRange(event.starts_at, event.ends_at)}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-6 shrink-0" aria-label="Where">📍</dt>
                <dd className="font-semibold text-daet-ink">{event.venue}</dd>
              </div>
              {event.organizer ? (
                <div className="flex gap-3">
                  <dt className="w-6 shrink-0" aria-label="Organizer">🏛️</dt>
                  <dd className="text-daet-ink/75">{event.organizer}</dd>
                </div>
              ) : null}
            </dl>

            {event.description ? (
              <p className="mt-6 whitespace-pre-line text-base leading-7 text-daet-ink/80">{event.description}</p>
            ) : null}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {!isPast ? (
                <a href={`/tours/events/${event.id}/calendar.ics`} className="inline-flex min-h-11 items-center justify-center rounded-full bg-daet-forest px-6 text-sm font-bold text-white hover:bg-daet-ink">
                  Add to my calendar
                </a>
              ) : null}
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-full border border-daet-forest/30 px-6 text-sm font-bold text-daet-forest hover:bg-daet-forest/5">
                Open in Google Maps
              </a>
              <Link href="/tours/browse" className="inline-flex min-h-11 items-center justify-center rounded-full border border-daet-ink/15 px-6 text-sm font-bold text-daet-ink hover:bg-daet-sand">
                Find a tour nearby
              </Link>
            </div>
          </div>
        </article>
      </div>
    </PageFrame>
  );
}
