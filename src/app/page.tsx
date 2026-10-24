import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { EventCard } from "@/components/tours/event-card";
import { MerchCard } from "@/components/tours/merch-card";
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
    <PageFrame adminNav>
      {/* Hero Section */}
      <section className="overflow-hidden rounded-[2rem] bg-daet-forest px-6 py-10 text-white shadow-card sm:px-10 sm:py-14 lg:px-14">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-100/80">Daet, Camarines Norte</p>
          <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight sm:text-6xl">
            Local stories.<br className="hidden sm:block" /> Local guides.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-white/80 sm:text-lg">
            CONNECT-DAET brings trusted local tour operators and meaningful Camarines Norte experiences together.
          </p>
          
          {user ? (
            <div className="mt-8">
              <Link 
                href="/dashboard" 
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-daet-sun px-7 text-sm font-black text-daet-ink transition hover:bg-amber-300"
              >
                Go to Dashboard <span className="ml-2" aria-hidden="true">→</span>
              </Link>
              <p className="mt-3 text-sm text-white/70">
                Signed in as <span className="font-bold">{user.email}</span>
              </p>
            </div>
          ) : (
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link 
                href="/login?next=/dashboard" 
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-daet-sun px-7 text-sm font-black text-daet-ink transition hover:bg-amber-300"
              >
                Login <span className="ml-2" aria-hidden="true">→</span>
              </Link>
              <Link 
                href="/tours/browse" 
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/30 px-7 text-sm font-bold text-white transition hover:bg-white/10"
              >
                Browse Tours
              </Link>
            </div>
          )}
        </div>
        <div className="mt-12 grid gap-3 border-t border-white/15 pt-6 text-sm sm:grid-cols-3 sm:gap-6">
          <div><span className="font-black text-daet-sun">01</span><p className="mt-1 text-white/75">Apply in three short steps</p></div>
          <div><span className="font-black text-daet-sun">02</span><p className="mt-1 text-white/75">Tourism Office verifies your documents</p></div>
          <div><span className="font-black text-daet-sun">03</span><p className="mt-1 text-white/75">Approved operators can publish packages</p></div>
        </div>
      </section>

      {/* Quick Access Cards */}
      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        {/* For Tourists */}
        <Link 
          href="/tours/browse"
          className="rounded-3xl border border-daet-ink/10 bg-white p-6 shadow-sm hover:shadow-md transition group"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-daet-leaf">For Tourists</p>
            <span className="text-2xl">🏖️</span>
          </div>
          <h2 className="text-xl font-black group-hover:text-daet-forest transition">Browse Tour Packages</h2>
          <p className="mt-2 text-sm leading-6 text-daet-ink/65">Discover amazing tours in Daet</p>
        </Link>

        {/* For Operators */}
        <Link 
          href={user ? "/dashboard" : "/tours/operator/register"}
          className="rounded-3xl border border-daet-ink/10 bg-white p-6 shadow-sm hover:shadow-md transition group"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-daet-leaf">For Operators</p>
            <span className="text-2xl">🏢</span>
          </div>
          <h2 className="text-xl font-black group-hover:text-daet-forest transition">
            {user ? 'Operator Dashboard' : 'Become an Operator'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-daet-ink/65">
            {user ? 'Manage your tour packages' : 'Get accredited and list tours'}
          </p>
        </Link>

        {/* For Admins */}
        <Link 
          href={user ? "/tours/admin" : "/login?next=/tours/admin"}
          className="rounded-3xl border border-daet-ink/10 bg-white p-6 shadow-sm hover:shadow-md transition group"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-daet-leaf">Tourism Office</p>
            <span className="text-2xl">🏛️</span>
          </div>
          <h2 className="text-xl font-black group-hover:text-daet-forest transition">Admin Dashboard</h2>
          <p className="mt-2 text-sm leading-6 text-daet-ink/65">Review applications and packages</p>
        </Link>
      </section>

      {/* Upcoming Events */}
      <section aria-labelledby="home-events" className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-daet-leaf">What&apos;s on</p>
            <h2 id="home-events" className="mt-1 text-2xl font-black text-daet-ink">Upcoming events</h2>
          </div>
          <Link href="/tours/events" className="inline-flex min-h-11 shrink-0 items-center text-sm font-bold text-daet-forest underline underline-offset-4">
            Full calendar →
          </Link>
        </div>
        {upcomingEvents.length > 0 ? (
          <ul className="grid gap-3 md:grid-cols-3">
            {upcomingEvents.map((event) => (
              <li key={event.id}>
                <EventCard event={event} compact />
              </li>
            ))}
          </ul>
        ) : (
          <Link href="/tours/events" className="block rounded-2xl border border-dashed border-daet-ink/20 bg-white p-6 text-center text-sm text-daet-ink/65 hover:bg-daet-sand/40">
            🗓️ No upcoming events posted yet. Open the calendar to check later dates.
          </Link>
        )}
      </section>

      {/* Featured Merchandise */}
      {featuredMerch.length > 0 ? (
        <section aria-labelledby="home-merch" className="mt-10">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-daet-leaf">Souvenirs &amp; pasalubong</p>
              <h2 id="home-merch" className="mt-1 text-2xl font-black text-daet-ink">Daet merchandise</h2>
            </div>
            <Link href="/tours/merch" className="inline-flex min-h-11 shrink-0 items-center text-sm font-bold text-daet-forest underline underline-offset-4">
              See all →
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

    </PageFrame>
  );
}
