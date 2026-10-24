import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { ButtonLink } from "@/components/ui/button";
import { EventCard } from "@/components/tours/event-card";
import { MerchCard } from "@/components/tours/merch-card";
import { PackageCard } from "@/app/(subsystems)/tours/browse/package-card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EVENT_COLUMNS, MERCH_COLUMNS, type MerchItem, type TourEvent } from "@/lib/tours/promo-validation";

const STEPS = [
  { title: "Pick an experience", body: "Browse packages from operators the Tourism Office has verified, filtered by place and length." },
  { title: "Book, then wait for a yes", body: "The operator confirms your date and group size before any payment is asked for." },
  { title: "Pay in pesos, show up", body: "Settle the balance by GCash, Maya or card, or upload your receipt. Your guide's QR badge proves who they are." },
];

function SectionHeading({ id, eyebrow, title, href, linkLabel }: { id: string; eyebrow: string; title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-daet-forest">{eyebrow}</p>
        <h2 id={id} className="mt-2 font-display text-3xl font-semibold leading-tight tracking-tight text-daet-ink sm:text-4xl">{title}</h2>
      </div>
      {href ? (
        <Link href={href} className="inline-flex min-h-11 shrink-0 items-center text-sm font-bold text-daet-forest underline underline-offset-4">
          {linkLabel} <span aria-hidden="true" className="ml-1">→</span>
        </Link>
      ) : null}
    </div>
  );
}

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Every section hides itself when empty (or before migrations are applied).
  const [packagesResult, eventsResult, merchResult] = await Promise.all([
    supabase
      .from("tours_packages")
      .select("id, title, location_name, duration_value, duration_type, cover_image_url, tours_package_price_variants(price_per_pax, flat_price, is_default)")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(6),
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
  const packages = (packagesResult.data ?? []) as unknown as Parameters<typeof PackageCard>[0]["package"][];
  const upcomingEvents = (eventsResult.data ?? []) as TourEvent[];
  const featuredMerch = (merchResult.data ?? []) as MerchItem[];
  const heroPhoto = packages.find((p) => p.cover_image_url);

  return (
    <PageFrame>
      {/* Hero */}
      <section className="overflow-hidden rounded-[28px] bg-daet-ink text-daet-foam">
        <div className="grid items-center gap-8 px-6 py-12 sm:px-10 lg:grid-cols-[1.1fr_1fr] lg:gap-12 lg:px-14 lg:py-16">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-daet-sun">Daet, Camarines Norte</p>
            <h1 className="mt-4 font-display text-5xl font-semibold leading-[0.95] tracking-tight sm:text-7xl">Daet, slowly.</h1>
            <p className="mt-5 max-w-md text-lg leading-7 text-daet-foam/85">
              Surf at sunrise, eat at the market, sleep to the sound of the tide. Hosted by locals the Tourism Office has verified.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/tours/browse" variant="accent" size="lg">Find a tour</ButtonLink>
              <Link href="/tours/events" className="inline-flex min-h-12 items-center justify-center rounded-full border-2 border-daet-foam px-7 text-base font-bold text-daet-foam transition hover:bg-daet-foam/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-daet-sun">What&apos;s on</Link>
            </div>
            <p className="mt-5 text-sm text-daet-foam/75">
              {user ? (
                <Link href="/dashboard" className="underline underline-offset-4">Go to your dashboard</Link>
              ) : (
                <>Already booked? <Link href="/login?next=/tours/my-bookings" className="underline underline-offset-4">Log in to see your trips</Link></>
              )}
            </p>
          </div>
          <div className="relative aspect-[3/2] overflow-hidden rounded-[28px] bg-daet-deep">
            {heroPhoto?.cover_image_url ? (
              <img src={heroPhoto.cover_image_url} alt="" className="h-full w-full object-cover" />
            ) : null}
            <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-daet-ink/80 to-transparent p-6 font-display text-3xl font-semibold leading-8">
              {heroPhoto ? heroPhoto.location_name : "Bagasbas Beach"}
            </p>
          </div>
        </div>
      </section>

      {/* Featured experiences */}
      {packages.length > 0 ? (
        <section aria-labelledby="home-tours" className="pt-12 sm:pt-20">
          <SectionHeading id="home-tours" eyebrow="Verified by the Tourism Office" title="Where to next" href="/tours/browse" linkLabel="All experiences" />
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {packages.map((pkg) => (
              <li key={pkg.id}><PackageCard package={pkg} /></li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* What's on */}
      <section aria-labelledby="home-events" className="pt-12 sm:pt-20">
        <SectionHeading id="home-events" eyebrow="What's on" title="Happening in Daet" href="/tours/events" linkLabel="Full calendar" />
        {upcomingEvents.length > 0 ? (
          <ul className="grid gap-4 md:grid-cols-3">
            {upcomingEvents.map((event) => (
              <li key={event.id}><EventCard event={event} compact /></li>
            ))}
          </ul>
        ) : (
          <Link href="/tours/events" className="block rounded-2xl border border-dashed border-daet-line bg-daet-foam p-6 text-center text-sm text-daet-ink/70 hover:bg-daet-sea/50">
            Nothing posted yet. Open the calendar to check later dates.
          </Link>
        )}
      </section>

      {/* How it works */}
      <section aria-labelledby="home-how" className="pt-12 sm:pt-20">
        <SectionHeading id="home-how" eyebrow="How it works" title="From idea to island" />
        <ol className="grid gap-6 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="border-t-2 border-daet-ink pt-4">
              <p className="font-display text-4xl font-semibold text-daet-forest">{i + 1}</p>
              <h3 className="mt-2 font-display text-xl font-semibold text-daet-ink">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-daet-ink/75">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Merchandise */}
      {featuredMerch.length > 0 ? (
        <section aria-labelledby="home-merch" className="pt-12 sm:pt-20">
          <SectionHeading id="home-merch" eyebrow="Souvenirs & pasalubong" title="Take a piece of Daet home" href="/tours/merch" linkLabel="See all" />
          <ul className="grid grid-cols-1 gap-6 min-[420px]:grid-cols-2 lg:grid-cols-4">
            {featuredMerch.map((item) => (
              <li key={item.id} className="flex"><MerchCard item={item} /></li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* For locals */}
      <section aria-labelledby="home-locals" className="mt-12 rounded-[28px] bg-daet-sea px-6 py-10 sm:mt-20 sm:px-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-daet-forest">For locals</p>
            <h2 id="home-locals" className="mt-2 font-display text-3xl font-semibold text-daet-ink">Run tours or guide in Daet?</h2>
            <p className="mt-2 max-w-xl text-daet-ink/80">Get accredited by the Tourism Office, publish your packages and reach visitors directly.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <ButtonLink href={user ? "/dashboard" : "/tours/operator/register"} variant="primary">{user ? "Operator dashboard" : "Become an operator"}</ButtonLink>
            <ButtonLink href="/tours/guide/register" variant="secondary">Become a guide</ButtonLink>
          </div>
        </div>
      </section>
    </PageFrame>
  );
}
