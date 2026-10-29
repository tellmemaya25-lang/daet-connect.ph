import { formatPeso } from "@/lib/money";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { RouteMap } from "@/components/maps/route-map";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { directionsUrl } from "@/lib/maps/geo";
import { ATTRACTION_CATEGORIES, ATTRACTION_COLUMNS, CATEGORY_ICONS, toAttraction } from "@/lib/tours/attractions";
import { describeHours, openStatus } from "@/lib/tours/opening-hours";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  if (!isSupabaseConfigured() || !/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("tours_attractions").select(ATTRACTION_COLUMNS).eq("slug", slug).eq("is_active", true).maybeSingle();
  return data ? toAttraction(data as Record<string, unknown>) : null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const attraction = await load((await params).slug);
  return attraction ? { title: attraction.name, description: attraction.description ?? undefined } : { title: "Attraction" };
}

export default async function AttractionPage({ params }: PageProps) {
  const attraction = await load((await params).slug);
  if (!attraction) notFound();

  const status = openStatus(attraction.opening_hours);
  const hours = describeHours(attraction.opening_hours);
  const pin = attraction.latitude !== null && attraction.longitude !== null ? { lat: attraction.latitude, lng: attraction.longitude } : null;
  const directions = pin ? directionsUrl([pin]) : null;

  return (
    <PageFrame>
      <div className="mx-auto max-w-3xl">
        <Link href="/tours/attractions" className="inline-flex min-h-11 items-center text-sm font-bold text-daet-forest hover:underline">
          ← All attractions
        </Link>

        {attraction.photo_url ? <img src={attraction.photo_url} alt={attraction.name} className="mt-2 h-64 w-full rounded-3xl object-cover" /> : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge tone="brand">
            {CATEGORY_ICONS[attraction.category]} {ATTRACTION_CATEGORIES[attraction.category]}
          </Badge>
          <Badge tone={status.state === "open" ? "success" : "neutral"}>{status.label}</Badge>
        </div>
        <h1 className="mt-2 text-4xl font-black text-daet-ink">{attraction.name}</h1>
        <p className="mt-1 text-sm font-semibold text-daet-ink/70">
          {attraction.address ?? attraction.municipality}
          {attraction.address && !attraction.address.includes(attraction.municipality) ? ` · ${attraction.municipality}` : ""}
        </p>

        {attraction.description ? <p className="mt-4 text-base leading-7 text-daet-ink/80">{attraction.description}</p> : null}

        <dl className="mt-6 grid gap-3 sm:grid-cols-3">
          <Fact label="Entrance fee" value={attraction.entrance_fee === null ? "Not listed" : attraction.entrance_fee === 0 ? "Free" : `${formatPeso(attraction.entrance_fee)}`} />
          <Fact label="Typical visit" value={attraction.dwell_minutes ? formatMinutes(attraction.dwell_minutes) : "Not listed"} />
          <Fact label="Municipality" value={attraction.municipality} />
        </dl>

        <section className="mt-6 rounded-3xl border border-daet-ink/10 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-daet-ink">Opening hours</h2>
          {hours.length ? (
            <table className="mt-3 w-full text-sm">
              <tbody>
                {hours.map((line) => (
                  <tr key={line.day} className="border-b border-daet-ink/5 last:border-0">
                    <th scope="row" className="py-1.5 pr-4 text-left font-bold text-daet-ink">{line.day}</th>
                    <td className="py-1.5 text-daet-ink/75">{line.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-2 text-sm text-daet-ink/65">Hours are not listed yet.</p>
          )}
          {attraction.hours_note ? <p className="mt-2 text-xs text-daet-ink/70">{attraction.hours_note}</p> : null}
          <p className="mt-1 text-xs text-daet-ink/70">Times are Philippine time.</p>
        </section>

        <section className="mt-6">
          <h2 className="mb-3 text-lg font-black text-daet-ink">Location</h2>
          {pin ? (
            <>
              <RouteMap points={[{ ...pin, label: attraction.name }]} title={`Map showing ${attraction.name}`} />
              {!attraction.location_verified ? (
                <p className="mt-2 text-xs text-daet-ink/70">Approximate pin from public sources, not yet confirmed by the Tourism Office.</p>
              ) : null}
              {directions ? (
                <a href={directions} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full bg-daet-forest px-6 text-sm font-bold text-white hover:bg-daet-ink">
                  Open in Google Maps
                </a>
              ) : null}
            </>
          ) : (
            <Notice variant="info">The exact location is still being confirmed by the Tourism Office.</Notice>
          )}
        </section>

        <p className="mt-8 border-t border-daet-ink/10 pt-4 text-xs leading-5 text-daet-ink/70">
          <span className="font-bold">Source:</span> {attraction.source}
        </p>
      </div>
    </PageFrame>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-daet-sand/50 p-4">
      <dt className="text-xs font-bold uppercase tracking-wide text-daet-ink/70">{label}</dt>
      <dd className="mt-1 font-black text-daet-ink">{value}</dd>
    </div>
  );
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
