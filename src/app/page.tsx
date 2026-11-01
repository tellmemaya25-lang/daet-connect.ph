import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { LineIcon } from "@/components/ui/icons";
import { PageFrame } from "@/components/ui/page-frame";
import { EventCard } from "@/components/tours/event-card";
import { MerchCard } from "@/components/tours/merch-card";
import { PlacePanels, type PlacePanel } from "@/components/home/place-panels";
import { PHOTOS, type PhotoKey } from "@/lib/photo-credits";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EVENT_COLUMNS, MERCH_COLUMNS, type MerchItem, type TourEvent } from "@/lib/tours/promo-validation";

const WRAP = "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8";

// One open at a time; the copy restates what this page and the place pages already say.
const PANELS: PlacePanel[] = (
  [
    {
      photo: "calaguasBeach",
      name: "Calaguas",
      icon: "beach",
      text: "A long white-sand beach on Tinaga Island, with no roads and no hotels. Two to three hours by boat from Paracale or Vinzons.",
      href: "/tours/attractions/tinaga-island-calaguas",
      cta: "See the place",
    },
    {
      photo: "apuao",
      name: "Apuao sandbar",
      icon: "beach",
      text: "Apuao's sandbar rises out of the sea at low tide, about an hour by boat from Mercedes port.",
      href: "/tours/attractions/apuao-grande-island",
      cta: "See the place",
    },
    {
      photo: "mercedesPort",
      name: "Mercedes port",
      icon: "boat",
      text: "Where the outrigger boats leave for Apuao and the other Mercedes islands.",
      href: "/tours/browse?location=Mercedes",
      cta: "Trips from Mercedes",
    },
    {
      photo: "bagasbas",
      name: "Bagasbas Beach",
      icon: "beach",
      text: "Daet's wide, flat surf beach, ten minutes from the plaza by tricycle. Come for the sunrise waves.",
      href: "/tours/attractions/bagasbas-beach",
      cta: "See the place",
    },
    {
      photo: "rizal",
      name: "First Rizal Monument",
      icon: "heritage",
      text: "The first monument to José Rizal, raised in Daet in 1898. Start a walk of the old town here.",
      href: "/tours/attractions/first-rizal-monument",
      cta: "See the place",
    },
    {
      photo: "church",
      name: "St John the Baptist Church",
      icon: "religious",
      text: "Daet's red-roofed parish church. The town fiesta for its patron saint is on June 24.",
      href: "/tours/events",
      cta: "See what's on",
    },
  ] satisfies Array<Omit<PlacePanel, "photo"> & { photo: PhotoKey }>
).map((panel) => ({ ...panel, photo: { src: PHOTOS[panel.photo].src, alt: PHOTOS[panel.photo].alt } }));

const HOME_PHOTOS: PhotoKey[] = ["calaguasBeach", "apuao", "mercedesPort", "rizal", "bagasbas", "church"];

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: { user } }, eventsResult, merchResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("tours_events").select(EVENT_COLUMNS).eq("is_published", true).gte("ends_at", new Date().toISOString()).order("starts_at", { ascending: true }).limit(4),
    supabase.from("tours_merchandise").select(MERCH_COLUMNS).eq("is_active", true).eq("is_featured", true).order("created_at", { ascending: false }).limit(4),
  ]);
  const upcomingEvents = (eventsResult.data ?? []) as TourEvent[];
  const featuredMerch = (merchResult.data ?? []) as MerchItem[];

  return (
    <PageFrame bleed credits={HOME_PHOTOS}>
      {/* First screen: what this is, one plain sentence, one action, and the beach itself. */}
      <section aria-labelledby="home-title" className="bg-surface">
        <div className={`${WRAP} grid gap-8 pb-10 pt-6 sm:pt-10 lg:grid-cols-[1fr_1.2fr] lg:items-center lg:gap-14 lg:pb-16`}>
          <div className="flex flex-col gap-5">
            <h1 id="home-title" data-reveal className="display-1 max-w-[10ch] text-daet-ink">
              Daet, by the tide.
            </h1>
            <p data-reveal style={{ "--reveal-index": 1 } as React.CSSProperties} className="max-w-xl text-lg leading-relaxed text-daet-ink sm:text-xl">
              Book small trips with Daet&apos;s own operators and guides: Bagasbas surf at sunrise, the Mercedes sandbar at low tide, a night on
              Calaguas.
            </p>
            <div data-reveal style={{ "--reveal-index": 2 } as React.CSSProperties} className="flex flex-wrap gap-3">
              <ButtonLink href="/tours/browse" size="lg">
                Find a trip
              </ButtonLink>
              <ButtonLink href={user ? "/dashboard" : "/tours/plan"} size="lg" variant="secondary">
                {user ? "My dashboard" : "Plan my days"}
              </ButtonLink>
            </div>
          </div>
          <figure className="relative -mx-4 aspect-[4/3] overflow-hidden sm:mx-0 sm:rounded-2xl lg:aspect-auto lg:h-[min(78vh,44rem)] lg:w-full">
            <Image
              src={PHOTOS.calaguasBeach.src}
              alt={PHOTOS.calaguasBeach.alt}
              fill
              priority
              sizes="(min-width: 1024px) 55vw, 100vw"
              className="drift object-cover"
            />
            <figcaption className="absolute bottom-3 left-3 rounded-full bg-slate-950/80 px-4 py-2 text-sm font-semibold text-white">
              Calaguas, two hours out by boat
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Places: one panel open at a time, the rest narrow and grey. */}
      <section aria-labelledby="home-places" className={`${WRAP} pt-16 sm:pt-24`}>
        <h2 id="home-places" data-reveal className="display-2 text-daet-ink">
          Places to start
        </h2>
        <p data-reveal style={{ "--reveal-index": 1 } as React.CSSProperties} className="mb-6 mt-3 max-w-2xl text-lg text-daet-ink sm:mb-8">
          Islands out by boat, the surf beach, and the old town where Rizal got his first monument.
        </p>
        <PlacePanels panels={PANELS} />
      </section>

      {/* What's on: dated rows. */}
      <section aria-labelledby="home-events" className={`${WRAP} pt-20 sm:pt-32`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="home-events" data-reveal className="display-2 text-daet-ink">
            What&apos;s on in Daet
          </h2>
          <Link href="/tours/events" className="inline-flex min-h-11 items-center gap-1 font-bold text-blue-700 dark:text-blue-300 hover:underline">
            Full calendar <LineIcon name="arrowRight" className="h-5 w-5" />
          </Link>
        </div>
        {upcomingEvents.length > 0 ? (
          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            {upcomingEvents.map((event) => (
              <li key={event.id} data-reveal>
                <EventCard event={event} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 rounded-2xl bg-surface p-6 text-lg text-daet-ink">
            No events are posted yet. The <Link href="/tours/events" className="font-bold text-blue-700 dark:text-blue-300 underline">calendar</Link> lists the
            festivals and seasons through the year.
          </p>
        )}
      </section>

      {/* How booking works: the page's one full-colour band. */}
      <section aria-labelledby="home-how" className="mt-20 bg-blue-600 py-16 text-white sm:mt-32 sm:py-24">
        <div className={`${WRAP} grid gap-10 lg:grid-cols-[1fr_1.4fr]`}>
          <h2 id="home-how" data-reveal className="display-2">
            Booking, in three moves
          </h2>
          <ol className="space-y-8">
            {[
              ["Pick a trip and a date.", "The meeting point, start time and cancellation terms are on the trip's page before you book."],
              ["Send your request.", "The operator confirms, then you pay by GCash, Maya or card, or upload a bank receipt."],
              ["Show your ticket QR.", "Your guide scans it at the meeting point, and the boat goes."],
            ].map(([title, text], index) => (
              <li key={title} data-reveal style={{ "--reveal-index": index } as React.CSSProperties} className="grid grid-cols-[auto_1fr] gap-4">
                <LineIcon name={(["calendar", "check", "ticket"] as const)[index]} className="mt-1 h-7 w-7" />
                <div>
                  <p className="text-2xl font-bold">{title}</p>
                  <p className="mt-1 text-lg text-blue-50">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {featuredMerch.length > 0 ? (
        <section aria-labelledby="home-merch" className={`${WRAP} pt-20 sm:pt-32`}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="home-merch" data-reveal className="display-2 text-daet-ink">
              Take Daet home
            </h2>
            <Link href="/tours/merch" className="inline-flex min-h-11 items-center gap-1 font-bold text-blue-700 dark:text-blue-300 hover:underline">
              All souvenirs <LineIcon name="arrowRight" className="h-5 w-5" />
            </Link>
          </div>
          <ul className="mt-6 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
            {featuredMerch.map((item) => (
              <li key={item.id} data-reveal className="flex">
                <MerchCard item={item} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* For operators and guides: a picture of their working world, and two ways in. */}
      <section aria-labelledby="home-ops" className={`${WRAP} pt-20 sm:pt-32`}>
        <div className="grid items-center gap-8 overflow-hidden rounded-2xl bg-surface lg:grid-cols-2">
          <div className="relative aspect-[4/3] lg:aspect-auto lg:h-full lg:min-h-[420px]">
            <Image src={PHOTOS.mercedesPort.src} alt={PHOTOS.mercedesPort.alt} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
          </div>
          <div className="px-5 pb-8 sm:px-8 lg:py-12 lg:pr-12">
            <h2 id="home-ops" data-reveal className="display-2 text-daet-ink">
              Run tours in Daet?
            </h2>
            <p data-reveal style={{ "--reveal-index": 1 } as React.CSSProperties} className="mt-4 text-lg leading-relaxed text-daet-ink">
              Apply as an operator or a local guide. The Tourism Office checks your permits and ID, then your trips go live and bookings come
              to your phone.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href="/tours/operator/register" size="lg">
                Apply as an operator
              </ButtonLink>
              <ButtonLink href="/tours/guide/register" size="lg" variant="secondary">
                Apply as a guide
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </PageFrame>
  );
}
