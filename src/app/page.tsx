import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { LineIcon } from "@/components/ui/icons";
import { PageFrame } from "@/components/ui/page-frame";
import { EventCard } from "@/components/tours/event-card";
import { MerchCard } from "@/components/tours/merch-card";
import { TripLengthPicker, type BoardTrip } from "@/components/tours/trip-length-picker";
import { PHOTOS, type PhotoKey } from "@/lib/photo-credits";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { EVENT_COLUMNS, MERCH_COLUMNS, type MerchItem, type TourEvent } from "@/lib/tours/promo-validation";
import { durationLabel, fromPrice, nextOpenDate, placePhoto, tripLength } from "@/lib/tours/trip-board";

const WRAP = "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8";

const PLACES: Array<{ photo: PhotoKey; name: string; text: string; detail: string; location: string }> = [
  {
    photo: "calaguasBeach",
    name: "Calaguas",
    text: "A long white-sand beach on Tinaga Island, with no roads and no hotels. Most people camp one night and swim at sunrise.",
    detail: "Two to three hours by boat from Paracale or Vinzons",
    location: "Calaguas",
  },
  {
    photo: "apuao",
    name: "The Mercedes islands",
    text: "Apuao's sandbar rises out of the sea at low tide. On Parola, 107 stone steps climb to the lighthouse.",
    detail: "About an hour by boat from Mercedes port",
    location: "Mercedes",
  },
  {
    photo: "rizal",
    name: "Daet town and Bagasbas",
    text: "Home of the first monument to José Rizal, raised in 1898. Walk the old town, then end the day surfing at Bagasbas.",
    detail: "Bagasbas is ten minutes from the plaza by tricycle",
    location: "Daet",
  },
];

const HOME_PHOTOS: PhotoKey[] = ["calaguasBeach", "calaguasCove", "apuao", "mercedesPort", "rizal", "bagasbas", "church"];

type PackageRow = {
  id: string;
  title: string;
  location_name: string | null;
  duration_value: number | null;
  duration_type: string | null;
  tours_package_price_variants?: Array<{ price_per_pax: number | null; flat_price: number | null; is_default: boolean | null }>;
  tours_package_availability?: Array<{ available_date: string; capacity_total: number | null; capacity_booked: number | null }>;
};

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const today = toManilaDateKey(new Date());
  const [{ data: { user } }, eventsResult, merchResult, packagesResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("tours_events").select(EVENT_COLUMNS).eq("is_published", true).gte("ends_at", new Date().toISOString()).order("starts_at", { ascending: true }).limit(4),
    supabase.from("tours_merchandise").select(MERCH_COLUMNS).eq("is_active", true).eq("is_featured", true).order("created_at", { ascending: false }).limit(4),
    supabase
      .from("tours_packages")
      .select("id, title, location_name, duration_value, duration_type, tours_package_price_variants(price_per_pax, flat_price, is_default), tours_package_availability(available_date, capacity_total, capacity_booked)")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(40),
  ]);
  const upcomingEvents = (eventsResult.data ?? []) as TourEvent[];
  const featuredMerch = (merchResult.data ?? []) as MerchItem[];
  const trips: BoardTrip[] = ((packagesResult.data ?? []) as PackageRow[]).map((pkg) => {
    const price = fromPrice(pkg.tours_package_price_variants);
    return {
      id: pkg.id,
      title: pkg.title,
      location: pkg.location_name ?? "Daet",
      length: tripLength(pkg.duration_value, pkg.duration_type),
      duration: durationLabel(pkg.duration_value, pkg.duration_type),
      price: price?.amount ?? null,
      perPerson: price?.perPerson ?? true,
      nextDate: nextOpenDate(pkg.tours_package_availability, today),
      photo: placePhoto(pkg.title, pkg.location_name),
    };
  });

  return (
    <PageFrame bleed credits={HOME_PHOTOS}>
      {/* First screen: what this is, one plain sentence, one action, and the beach itself. */}
      <section aria-labelledby="home-title" className="bg-white">
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
          <figure className="relative -mx-4 aspect-[4/3] overflow-hidden sm:mx-0 sm:rounded-2xl lg:aspect-[5/6] lg:max-h-[78vh]">
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

      {/* The live thing: real trips, by the time they take. */}
      <section aria-labelledby="home-length" className={`${WRAP} pt-16 sm:pt-24`}>
        <h2 id="home-length" data-reveal className="display-2 text-daet-ink">
          How long have you got?
        </h2>
        <p data-reveal style={{ "--reveal-index": 1 } as React.CSSProperties} className="mb-6 mt-3 max-w-2xl text-lg text-daet-ink">
          The more time you have, the farther out the boat goes. Pick a length to see the trips that fit and their next open dates.
        </p>
        <TripLengthPicker trips={trips} />
      </section>

      {/* Three places, each with its own picture, alternating sides on wide screens. */}
      <section aria-labelledby="home-places" className={`${WRAP} pt-20 sm:pt-32`}>
        <h2 id="home-places" data-reveal className="display-2 text-daet-ink">
          Three places to start
        </h2>
        <ul className="mt-8 space-y-14 sm:mt-12 sm:space-y-24">
          {PLACES.map((place, index) => (
            <li key={place.name} className="grid items-center gap-6 lg:grid-cols-2 lg:gap-14">
              <div data-reveal className={`relative -mx-4 aspect-[4/3] overflow-hidden bg-blue-100 sm:mx-0 sm:rounded-2xl ${index % 2 ? "lg:order-2" : ""}`}>
                <Image src={PHOTOS[place.photo].src} alt={PHOTOS[place.photo].alt} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
              </div>
              <div>
                <h3 data-reveal className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight tracking-tight text-daet-ink sm:text-5xl">
                  {place.name}
                </h3>
                <p data-reveal style={{ "--reveal-index": 1 } as React.CSSProperties} className="mt-4 max-w-lg text-lg leading-relaxed text-daet-ink">
                  {place.text}
                </p>
                <p data-reveal style={{ "--reveal-index": 2 } as React.CSSProperties} className="mt-3 flex items-center gap-2 font-semibold text-daet-ink/80">
                  <LineIcon name="boat" className="h-5 w-5 text-blue-600" /> {place.detail}
                </p>
                <ButtonLink href={`/tours/browse?location=${encodeURIComponent(place.location)}`} variant="secondary" className="mt-6">
                  Trips in {place.location}
                </ButtonLink>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* What's on: dated rows. */}
      <section aria-labelledby="home-events" className={`${WRAP} pt-20 sm:pt-32`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="home-events" data-reveal className="display-2 text-daet-ink">
            What&apos;s on in Daet
          </h2>
          <Link href="/tours/events" className="inline-flex min-h-11 items-center gap-1 font-bold text-blue-700 hover:underline">
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
          <p className="mt-6 rounded-2xl bg-white p-6 text-lg text-daet-ink">
            No events are posted yet. The <Link href="/tours/events" className="font-bold text-blue-700 underline">calendar</Link> lists the
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
            <Link href="/tours/merch" className="inline-flex min-h-11 items-center gap-1 font-bold text-blue-700 hover:underline">
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
        <div className="grid items-center gap-8 overflow-hidden rounded-2xl bg-white lg:grid-cols-2">
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
