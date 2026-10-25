import Image from "next/image";
import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { EventCard } from "@/components/tours/event-card";
import { MerchCard } from "@/components/tours/merch-card";
import { TripLengthPicker } from "@/components/tours/trip-length-picker";
import { PhotoCredits } from "@/components/ui/photo-credits";
import { PHOTOS } from "@/lib/photo-credits";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EVENT_COLUMNS, MERCH_COLUMNS, type MerchItem, type TourEvent } from "@/lib/tours/promo-validation";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Both sections hide themselves when empty (or before the migration is applied).
  const [eventsResult, merchResult] = await Promise.all([
    supabase
      .from("tours_events")
      .select(EVENT_COLUMNS)
      .eq("is_published", true)
      .gte("ends_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(3),
    supabase
      .from("tours_merchandise")
      .select(MERCH_COLUMNS)
      .eq("is_active", true)
      .eq("is_featured", true)
      .order("created_at", { ascending: false })
      .limit(4),
  ]);
  const upcomingEvents = (eventsResult.data ?? []) as TourEvent[];
  const featuredMerch = (merchResult.data ?? []) as MerchItem[];

  return (
    <PageFrame>
      {/* Hero: the name of the place, one plain sentence, one action, one big photograph. */}
      <section aria-labelledby="home-title" className="grid items-stretch gap-8 lg:grid-cols-[1fr_1.15fr] lg:gap-12">
        <div className="flex flex-col justify-center gap-6 py-2">
          <h1 id="home-title" className="text-6xl leading-[0.95] text-daet-ink sm:text-7xl lg:text-8xl">
            Daet, slowly.
          </h1>
          <p className="max-w-md text-lg leading-8 text-daet-ink">
            Surf Bagasbas at sunrise, walk the Mercedes sandbar at low tide, sleep on the white sand of Calaguas. Small
            trips run by local operators and guides.
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href="/tours/browse"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-daet-forest px-8 text-base font-bold text-white transition hover:bg-daet-leaf focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-daet-forest"
            >
              Find a trip
            </Link>
            {user ? (
              <Link href="/dashboard" className="inline-flex min-h-11 items-center font-bold text-daet-leaf underline underline-offset-4">
                Go to my dashboard
              </Link>
            ) : (
              <Link href="/tours/operator/register" className="inline-flex min-h-11 items-center font-bold text-daet-leaf underline underline-offset-4">
                Run tours here? Apply
              </Link>
            )}
          </div>
        </div>
        <figure className="relative min-h-[320px] overflow-hidden rounded-2xl bg-daet-leaf sm:min-h-[440px] lg:min-h-[560px]">
          <Image
            src={PHOTOS.bagasbas.src}
            alt={PHOTOS.bagasbas.alt}
            fill
            priority
            sizes="(min-width: 1024px) 55vw, 100vw"
            className="object-cover object-[40%_60%]"
          />
          <figcaption className="absolute bottom-4 left-4 right-4 rounded-xl bg-daet-ink/80 px-4 py-3 text-sm text-white sm:right-auto">
            Bagasbas Beach, ten minutes from the Daet plaza
          </figcaption>
        </figure>
      </section>

      {/* How long have you got? */}
      <section aria-labelledby="home-length" className="mt-20 sm:mt-28">
        <h2 id="home-length" className="mb-3 text-4xl leading-tight text-daet-ink sm:text-5xl">
          How long have you got?
        </h2>
        <p className="mb-8 text-lg text-daet-ink">The more time you have, the farther out the boat goes.</p>
        <TripLengthPicker />
      </section>

      {/* Three places */}
      <section aria-labelledby="home-places" className="mt-20 sm:mt-28">
        <h2 id="home-places" className="mb-8 text-4xl leading-tight text-daet-ink sm:text-5xl">
          Three places to start
        </h2>
        <ul className="grid gap-8 md:grid-cols-3">
          {[
            { photo: PHOTOS.calaguasBeach, name: "Calaguas", text: "A long white-sand beach on Tinaga Island, with no roads and no hotels. Most people camp one night.", location: "Calaguas" },
            { photo: PHOTOS.apuao, name: "Mercedes islands", text: "Apuao's sandbar appears at low tide. On Parola, 107 stone steps climb to the lighthouse.", location: "Mercedes" },
            { photo: PHOTOS.rizal, name: "Daet town", text: "Home of the oldest monument to José Rizal. Start a heritage walk at its foot, end at Bagasbas for sunset.", location: "Daet" },
          ].map((place) => (
            <li key={place.name} className="flex flex-col gap-4">
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-daet-leaf">
                <Image src={place.photo.src} alt={place.photo.alt} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover" />
              </div>
              <h3 className="font-display text-3xl leading-tight text-daet-ink">{place.name}</h3>
              <p className="text-daet-ink">{place.text}</p>
              <Link
                href={`/tours/browse?location=${encodeURIComponent(place.location)}`}
                className="inline-flex min-h-11 items-center self-start font-bold text-daet-leaf underline underline-offset-4"
              >
                Trips in {place.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Upcoming Events */}
      <section aria-labelledby="home-events" className="mt-20 sm:mt-28">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <h2 id="home-events" className="text-4xl leading-tight text-daet-ink sm:text-5xl">
            What&apos;s on
          </h2>
          <Link href="/tours/events" className="inline-flex min-h-11 shrink-0 items-center font-bold text-daet-leaf underline underline-offset-4">
            Full calendar
          </Link>
        </div>
        {upcomingEvents.length > 0 ? (
          <ul className="grid gap-4 md:grid-cols-3">
            {upcomingEvents.map((event) => (
              <li key={event.id}>
                <EventCard event={event} compact />
              </li>
            ))}
          </ul>
        ) : (
          <Link href="/tours/events" className="block rounded-2xl bg-white p-6 text-daet-ink hover:bg-daet-sand">
            No events are posted yet. Open the calendar to see the festivals and seasons through the year.
          </Link>
        )}
      </section>

      {/* How booking works: a full-width blue band */}
      <section aria-labelledby="home-how" className="-mx-4 mt-20 bg-daet-forest px-4 py-16 text-white sm:-mx-6 sm:mt-28 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_1.6fr]">
          <h2 id="home-how" className="text-4xl leading-tight sm:text-5xl">
            Booking, in three moves
          </h2>
          <div className="space-y-5 text-xl leading-8">
            <p><strong>First,</strong> pick a trip and a date. The meeting point, start time and cancellation terms are on the page before you book.</p>
            <p><strong>Then,</strong> send your request. The operator confirms, and you pay with GCash or card once they do.</p>
            <p><strong>Finally,</strong> show your booking QR at the meeting point. Your guide scans it and the boat goes.</p>
          </div>
        </div>
      </section>

      {/* Featured Merchandise */}
      {featuredMerch.length > 0 ? (
        <section aria-labelledby="home-merch" className="mt-20 sm:mt-28">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <h2 id="home-merch" className="text-4xl leading-tight text-daet-ink sm:text-5xl">
              Take Daet home
            </h2>
            <Link href="/tours/merch" className="inline-flex min-h-11 shrink-0 items-center font-bold text-daet-leaf underline underline-offset-4">
              See all souvenirs
            </Link>
          </div>
          <ul className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
            {featuredMerch.map((item) => (
              <li key={item.id} className="flex">
                <MerchCard item={item} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* For operators and guides */}
      <section aria-labelledby="home-ops" className="-mx-4 mt-20 bg-daet-ink px-4 py-16 text-white sm:-mx-6 sm:mt-28 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-8">
          <div className="max-w-2xl">
            <h2 id="home-ops" className="text-4xl leading-tight sm:text-5xl">
              Run tours in Daet?
            </h2>
            <p className="mt-4 text-lg leading-8 text-slate-200">
              Apply as an operator or a local guide. The Tourism Office checks your permits and ID, then your trips go live.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/tours/operator/register" className="inline-flex min-h-12 items-center rounded-full bg-white px-7 font-bold text-daet-ink transition hover:bg-daet-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              Apply as an operator
            </Link>
            <Link href="/tours/guide/register" className="inline-flex min-h-12 items-center rounded-full border-2 border-white px-7 font-bold text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              Apply as a guide
            </Link>
          </div>
        </div>
      </section>

      <div className="mt-10">
        <PhotoCredits keys={["bagasbas", "calaguasBeach", "calaguasCove", "apuao", "mercedesPort", "rizal", "church"]} />
      </div>
    </PageFrame>
  );
}
