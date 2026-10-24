import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { MerchCard } from "@/components/tours/merch-card";
import { EVENT_CATEGORY_STYLES } from "@/components/tours/event-card";
import { formatEventRange } from "@/lib/tours/events-calendar";
import { EVENT_CATEGORIES, type MerchItem, type TourEvent } from "@/lib/tours/promo-validation";
import type { PackageCardData } from "@/app/(subsystems)/tours/browse/package-card";
import { PHOTOS } from "@/lib/photo-credits";
import { TourPicker } from "./tour-picker";

const STEPS = [
  { lead: "First, pick.", body: "Browse packages from operators the Tourism Office has verified. Filter by place and by how long you have." },
  { lead: "Then, wait for a yes.", body: "The operator confirms your date and group size before anyone asks you for money." },
  { lead: "Finally, pay and go.", body: "Settle the balance by GCash, Maya or card, or upload your receipt. Your guide carries a QR badge that proves who they are." },
];

const PLACES = [
  { key: "calaguas", search: "Calaguas", line: "White sand, a two-hour boat ride from the port, and a night under the stars." },
  { key: "parola", search: "Parola", line: "A long sandbar and clear water off the coast of Daet." },
  { key: "apuao", search: "Apuao", line: "Quiet lagoons and pine-fringed sand in the Mercedes islands." },
] as const;

function Heading({ id, children, href, linkLabel }: { id: string; children: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4 sm:mb-8">
      <h2 id={id} className="font-display text-4xl font-semibold leading-[1.05] tracking-tight text-daet-ink sm:text-5xl">{children}</h2>
      {href ? (
        <Link href={href} className="inline-flex min-h-11 shrink-0 items-center text-sm font-bold text-blue-700 underline underline-offset-4">
          {linkLabel} <span aria-hidden="true" className="ml-1">→</span>
        </Link>
      ) : null}
    </div>
  );
}

function eventDay(iso: string) {
  const d = new Date(iso);
  return {
    day: new Intl.DateTimeFormat("en-PH", { day: "numeric", timeZone: "Asia/Manila" }).format(d),
    month: new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "Asia/Manila" }).format(d),
  };
}

export function LandingView({
  signedIn,
  packages,
  events,
  merch,
}: {
  signedIn: boolean;
  packages: PackageCardData[];
  events: TourEvent[];
  merch: MerchItem[];
}) {
  return (
    <>
      {/* Hero: the answer in large type, the picture as half the screen */}
      <section className="grid gap-4 lg:min-h-[640px] lg:grid-cols-2 lg:gap-6">
        <div className="flex flex-col justify-center py-4 lg:py-10">
          <h1 className="font-display text-[3.5rem] font-semibold leading-[0.95] tracking-tight text-daet-ink sm:text-8xl lg:text-9xl">
            Daet, slowly.
          </h1>
          <p className="mt-6 max-w-md text-lg leading-7 text-daet-ink/85">
            Surf at sunrise, eat at the market, sleep to the sound of the tide. Tours hosted by locals the Tourism Office has verified.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/tours/browse" size="lg">Find a tour</ButtonLink>
            <ButtonLink href="/tours/events" variant="secondary" size="lg">What&apos;s on</ButtonLink>
          </div>
          <p className="mt-5 text-sm text-daet-ink/80">
            {signedIn ? (
              <Link href="/dashboard" className="font-bold text-blue-700 underline underline-offset-4">Go to your dashboard</Link>
            ) : (
              <>Already booked? <Link href="/login?next=/tours/my-bookings" className="font-bold text-blue-700 underline underline-offset-4">Log in to see your trips</Link></>
            )}
          </p>
        </div>
        <div className="relative min-h-[320px] overflow-hidden rounded-2xl bg-blue-700 sm:min-h-[420px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={PHOTOS.bagasbas.file} alt={PHOTOS.bagasbas.alt} width={1600} height={1200} fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
          <p className="absolute bottom-0 left-0 rounded-tr-2xl bg-daet-ink/80 px-5 py-3 font-display text-xl font-semibold text-white sm:text-2xl">Bagasbas, Daet</p>
        </div>
      </section>

      {/* Featured experiences with the live picker */}
      {packages.length > 0 ? (
        <section aria-labelledby="home-tours" className="pt-16 sm:pt-24 lg:pt-32">
          <Heading id="home-tours" href="/tours/browse" linkLabel="All experiences">How long have you got?</Heading>
          <TourPicker packages={packages} />
        </section>
      ) : null}

      {/* Places: the three trips people come for */}
      <section aria-labelledby="home-places" className="pt-16 sm:pt-24 lg:pt-32">
        <Heading id="home-places" href="/tours/browse" linkLabel="All experiences">Three places, three kinds of day</Heading>
        <ul className="grid gap-4 sm:gap-6 lg:grid-cols-3 lg:grid-rows-2">
          {PLACES.map((place, i) => (
            <li key={place.key} className={i === 0 ? "lg:col-span-2 lg:row-span-2" : undefined}>
              <Link href={`/tours/browse?location=${encodeURIComponent(place.search)}`} className="group relative block h-full min-h-[260px] overflow-hidden rounded-2xl bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:min-h-[320px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={PHOTOS[place.key].file} alt={PHOTOS[place.key].alt} width={1600} height={1200} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                <div className="absolute inset-x-0 bottom-0 bg-daet-ink/80 p-4 text-white sm:p-5">
                  <h3 className="font-display text-2xl font-semibold leading-8 sm:text-3xl sm:leading-9">{PHOTOS[place.key].place}</h3>
                  <p className="mt-1 text-sm text-white sm:text-base">{place.line}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* What's on: dates as the figure */}
      <section aria-labelledby="home-events" className="pt-16 sm:pt-24 lg:pt-32">
        <Heading id="home-events" href="/tours/events" linkLabel="Full calendar">What&apos;s on in Daet</Heading>
        {events.length > 0 ? (
          <ul className="grid gap-2">
            {events.map((event) => {
              const { day, month } = eventDay(event.starts_at);
              const style = EVENT_CATEGORY_STYLES[event.category];
              return (
                <li key={event.id}>
                  <Link
                    href={`/tours/events/${event.id}`}
                    className="group grid grid-cols-[4.5rem_1fr] items-center gap-4 rounded-2xl bg-white p-4 transition hover:bg-blue-50 sm:grid-cols-[7rem_1fr_auto] sm:gap-8 sm:p-6"
                  >
                    <p className="font-display text-5xl font-semibold leading-none text-daet-ink sm:text-7xl">
                      {day}
                      <span className="block text-base font-bold text-blue-700 sm:text-xl">{month}</span>
                    </p>
                    <div className="min-w-0">
                      <p className="font-display text-xl font-semibold leading-6 text-daet-ink group-hover:text-blue-700 sm:text-3xl sm:leading-9">{event.title}</p>
                      <p className="mt-1 text-sm text-daet-ink/80 sm:text-base">{formatEventRange(event.starts_at, event.ends_at)} · {event.venue}</p>
                    </div>
                    <span className={`hidden self-start rounded-full px-3 py-1 text-sm font-bold sm:inline-block ${style.chip}`}>{EVENT_CATEGORIES[event.category]}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <Link href="/tours/events" className="block rounded-2xl bg-white p-6 text-daet-ink/80 hover:bg-blue-50">
            Nothing posted yet. Open the calendar to check later dates.
          </Link>
        )}
      </section>

      {/* How it works: a blue field, steps told in words */}
      <section aria-labelledby="home-how" className="mt-16 rounded-2xl bg-blue-600 px-5 py-12 text-white sm:mt-24 sm:px-10 sm:py-16 lg:mt-32 lg:px-14 lg:py-20">
        <h2 id="home-how" className="max-w-2xl font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">From idea to island</h2>
        <ol className="mt-10 grid gap-10 lg:grid-cols-3 lg:gap-12">
          {STEPS.map((step) => (
            <li key={step.lead}>
              <h3 className="font-display text-3xl font-semibold leading-9">{step.lead}</h3>
              <p className="mt-3 text-lg leading-7 text-white">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Merchandise */}
      {merch.length > 0 ? (
        <section aria-labelledby="home-merch" className="pt-16 sm:pt-24 lg:pt-32">
          <Heading id="home-merch" href="/tours/merch" linkLabel="See all">Take a piece of Daet home</Heading>
          <ul className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 sm:gap-6 lg:grid-cols-4">
            {merch.map((item) => (
              <li key={item.id} className="flex"><MerchCard item={item} /></li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* For locals */}
      <section aria-labelledby="home-locals" className="mt-16 rounded-2xl bg-daet-ink px-5 py-12 text-white sm:mt-24 sm:px-10 sm:py-16 lg:mt-32 lg:px-14">
        <div className="grid items-end gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 id="home-locals" className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">Run tours or guide in Daet?</h2>
            <p className="mt-4 max-w-xl text-lg leading-7 text-white">Get accredited by the Tourism Office, publish your packages and meet visitors directly.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
            <ButtonLink href={signedIn ? "/dashboard" : "/tours/operator/register"} size="lg">{signedIn ? "Operator dashboard" : "Become an operator"}</ButtonLink>
            <Link href="/tours/guide/register" className="inline-flex min-h-12 items-center justify-center rounded-full border-2 border-white px-7 text-base font-bold text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Become a guide</Link>
          </div>
        </div>
      </section>

      <p className="pt-10 text-sm leading-6 text-daet-ink/80">
        Photos from Wikimedia Commons, cropped and resized:{" "}
        {Object.values(PHOTOS).map((p, i, all) => (
          <span key={p.file}>
            <a href={p.source} className="underline underline-offset-2">{p.title}</a> by {p.author} (<a href={p.licenseUrl} className="underline underline-offset-2">{p.license}</a>)
            {i < all.length - 1 ? "; " : "."}
          </span>
        ))}
      </p>
    </>
  );
}
