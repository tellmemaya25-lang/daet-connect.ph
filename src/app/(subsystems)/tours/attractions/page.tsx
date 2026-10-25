import type { Metadata } from "next";
import Link from "next/link";
import { RouteMap } from "@/components/maps/route-map";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ATTRACTION_CATEGORIES, ATTRACTION_COLUMNS, CATEGORY_ICONS, isAttractionCategory, toAttraction } from "@/lib/tours/attractions";
import { openStatus } from "@/lib/tours/opening-hours";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Attractions in Daet",
  description: "Beaches, heritage sites, islands and more around Daet, Camarines Norte.",
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const STATUS_TONE = { open: "success", closed: "neutral", unknown: "neutral" } as const;

function filterHref(category: string | null, openNow: boolean) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (openNow) params.set("open", "now");
  const query = params.toString();
  return `/tours/attractions${query ? `?${query}` : ""}`;
}

export default async function AttractionsPage({ searchParams }: PageProps) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">Configure Supabase to browse attractions.</Notice>
      </PageFrame>
    );
  }

  const params = await searchParams;
  const category = typeof params.category === "string" && isAttractionCategory(params.category) ? params.category : null;
  const openNow = params.open === "now";

  const supabase = await createSupabaseServerClient();
  let query = supabase.from("tours_attractions").select(ATTRACTION_COLUMNS).eq("is_active", true).order("name");
  if (category) query = query.eq("category", category);
  const { data, error } = await query;

  const now = new Date();
  const attractions = (data ?? [])
    .map((row) => toAttraction(row as Record<string, unknown>))
    .map((attraction) => ({ ...attraction, status: openStatus(attraction.opening_hours, now) }))
    .filter((attraction) => !openNow || attraction.status.state === "open");
  const pins = attractions
    .filter((a) => a.latitude !== null && a.longitude !== null)
    .map((a) => ({ lat: a.latitude!, lng: a.longitude!, label: a.name, href: `/tours/attractions/${a.slug}` }));

  return (
    <PageFrame>
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-bold text-daet-leaf">Explore Camarines Norte</p>
        <h1 className="mt-1 text-4xl font-black text-daet-ink">Attractions</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-daet-ink/70">
          Beaches, heritage sites and islands around Daet. Details come from the sources shown on each place; check hours before you go.
        </p>

        <nav className="mt-6 flex flex-wrap gap-2" aria-label="Filter attractions">
          <Link href={filterHref(null, openNow)} className={chip(!category)}>
            All
          </Link>
          {Object.entries(ATTRACTION_CATEGORIES).map(([value, label]) => (
            <Link key={value} href={filterHref(value, openNow)} className={chip(category === value)}>
              {label}
            </Link>
          ))}
          <Link href={filterHref(category, !openNow)} className={chip(openNow)}>
            {openNow ? "✓ " : ""}Open now
          {openNow ? <span className="sr-only"> (on)</span> : null}
          </Link>
        </nav>

        {error ? <Notice variant="error" className="mt-6">Attractions could not be loaded. Refresh to try again.</Notice> : null}

        {pins.length > 0 ? (
          <div className="mt-6">
            <RouteMap points={pins} title="Map of the listed attractions" />
          </div>
        ) : null}

        {attractions.length === 0 && !error ? (
          <p className="mt-8 rounded-3xl border border-daet-ink/10 bg-white p-8 text-center text-sm text-daet-ink/70">
            {openNow ? "Nothing listed is open right now. Try again later or clear the filter." : "No attractions listed in this category yet."}
          </p>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {attractions.map((attraction) => (
              <li key={attraction.id}>
                <Link href={`/tours/attractions/${attraction.slug}`} className="flex h-full flex-col overflow-hidden rounded-3xl border border-daet-ink/10 bg-white shadow-sm transition hover:shadow-card">
                  {attraction.photo_url ? (
                    <img src={attraction.photo_url} alt="" className="h-40 w-full object-cover" />
                  ) : (
                    <div className="grid h-24 place-items-center bg-daet-sand/60 text-3xl" aria-hidden="true">
                      {CATEGORY_ICONS[attraction.category]}
                    </div>
                  )}
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="brand">{ATTRACTION_CATEGORIES[attraction.category]}</Badge>
                      <Badge tone={STATUS_TONE[attraction.status.state]}>{attraction.status.label}</Badge>
                    </div>
                    <h2 className="mt-3 text-lg font-black text-daet-ink">{attraction.name}</h2>
                    <p className="text-xs font-semibold text-daet-ink/70">{attraction.municipality}</p>
                    {attraction.description ? <p className="mt-2 line-clamp-3 text-sm text-daet-ink/70">{attraction.description}</p> : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageFrame>
  );
}

function chip(active: boolean) {
  return `inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-bold transition ${
    active ? "border-daet-forest bg-daet-forest text-white" : "border-daet-ink/15 bg-white text-daet-ink hover:bg-daet-sand"
  }`;
}
