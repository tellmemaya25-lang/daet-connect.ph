import { notFound } from "next/navigation";
import { RouteMap } from "@/components/maps/route-map";
import { directionsUrl, formatDistance, formatDuration } from "@/lib/maps/geo";
import { planRoute, type RouteSummary } from "@/lib/maps/routes";
import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PackageDetailPage({ params }: PageProps) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">
          Configure Supabase to view package details.
        </Notice>
      </PageFrame>
    );
  }

  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  // Fetch package with all details
  const { data: pkg, error } = await supabase
    .from("tours_packages")
    .select(
      `
      id,
      title,
      description,
      location_name,
      duration_value,
      duration_type,
      cover_image_url,
      status,
      created_at,
      updated_at,
      tours_package_price_variants(
        id,
        variant_name,
        price_per_pax,
        flat_price,
        min_pax,
        max_pax,
        is_default
      ),
      tours_package_inclusions(
        id,
        item_text,
        is_included
      ),
      tours_package_stops(
        id,
        location_name,
        description,
        latitude,
        longitude,
        stop_order
      ),
      tours_package_gallery(
        id,
        image_url,
        caption,
        display_order
      ),
      tours_operators(
        id,
        business_name
      )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Package detail error:", error);
    return (
      <PageFrame>
        <Notice variant="error" title="Could not load package">
          {error.message}
        </Notice>
      </PageFrame>
    );
  }

  if (!pkg || pkg.status !== "published") {
    notFound();
  }

  // Get default price or first price variant
  const defaultVariant = pkg.tours_package_price_variants?.find((v: any) => v.is_default) ||
    pkg.tours_package_price_variants?.[0];
  
  const displayPrice = defaultVariant?.price_per_pax || defaultVariant?.flat_price || 0;
  const priceLabel = defaultVariant?.price_per_pax ? "per person" : "flat rate";

  // Sort inclusions
  const included = pkg.tours_package_inclusions?.filter((i: any) => i.is_included) || [];
  const excluded = pkg.tours_package_inclusions?.filter((i: any) => !i.is_included) || [];

  // Sort stops by stop_order (using correct column name)
  const stops = (pkg.tours_package_stops || []).sort((a: any, b: any) => a.stop_order - b.stop_order);

  // Route between stops that have a map pin (Routes API, cached; estimate as fallback).
  const pinnedStops = stops
    .map((stop: any) => ({ ...stop, lat: stop.latitude === null ? null : Number(stop.latitude), lng: stop.longitude === null ? null : Number(stop.longitude) }))
    .filter((stop: any) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng) && stop.lat !== null && stop.lng !== null);
  let route: RouteSummary | null = null;
  if (pinnedStops.length >= 2) {
    try {
      route = await planRoute(pinnedStops.map((stop: any) => ({ lat: stop.lat, lng: stop.lng })));
    } catch (routeError) {
      console.error("Package route error:", routeError);
    }
  }
  const mapPoints = pinnedStops.map((stop: any) => ({ lat: stop.lat, lng: stop.lng, label: stop.location_name }));
  const routeLink = directionsUrl(mapPoints);

  // Sort gallery by display order
  const gallery = (pkg.tours_package_gallery || []).sort((a: any, b: any) => a.display_order - b.display_order);

  return (
    <PageFrame>
      <div className="mx-auto max-w-7xl">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm text-daet-ink/60">
          <Link href="/tours/browse" className="hover:text-daet-forest">
            Browse packages
          </Link>
          <span className="mx-2">→</span>
          <span className="text-daet-ink">{pkg.title}</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Main content */}
          <div className="lg:col-span-2">
            {/* Cover image */}
            {pkg.cover_image_url ? (
              <div className="aspect-video overflow-hidden rounded-3xl bg-daet-sand">
                <img
                  src={pkg.cover_image_url}
                  alt={pkg.title}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="aspect-video rounded-3xl bg-daet-sand" />
            )}

            {/* Title and description */}
            <h1 className="mt-6 text-4xl font-black text-daet-ink">{pkg.title}</h1>
            <p className="mt-2 text-sm text-daet-ink/60">
              📍 {pkg.location_name} · ⏱️ {pkg.duration_value}{" "}
              {pkg.duration_type === "hours" ? "hours" : "days"}
            </p>

            <div className="mt-6 rounded-2xl border border-daet-ink/10 bg-white p-6">
              <h2 className="font-black text-daet-ink">About this experience</h2>
              <p className="mt-3 leading-7 text-daet-ink/80">
                {pkg.description || "No description available."}
              </p>
            </div>

            {/* Inclusions */}
            {(included.length > 0 || excluded.length > 0) && (
              <div className="mt-6 rounded-2xl border border-daet-ink/10 bg-white p-6">
                <h2 className="font-black text-daet-ink">What's included</h2>

                {included.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {included.map((item: any) => (
                      <li key={item.id} className="flex items-start gap-2 text-sm text-daet-ink/80">
                        <span className="text-green-600">✓</span>
                        <span>{item.item_text}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {excluded.length > 0 && (
                  <>
                    <h3 className="mt-6 text-sm font-bold text-daet-ink/60">Not included</h3>
                    <ul className="mt-3 space-y-2">
                      {excluded.map((item: any) => (
                        <li key={item.id} className="flex items-start gap-2 text-sm text-daet-ink/80">
                          <span className="text-red-600">✗</span>
                          <span>{item.item_text}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            {/* Itinerary stops */}
            {stops.length > 0 && (
              <div className="mt-6 rounded-2xl border border-daet-ink/10 bg-white p-6">
                <h2 className="font-black text-daet-ink">Itinerary</h2>
                <div className="mt-4 space-y-4">
                  {stops.map((stop: any, idx: number) => (
                    <div key={stop.id} className="flex gap-4">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-daet-leaf text-sm font-black text-white">
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-daet-ink">{stop.location_name}</h3>
                        {stop.description && (
                          <p className="mt-1 text-sm text-daet-ink/70">{stop.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Route map */}
            {mapPoints.length > 0 && (
              <div className="mt-6 rounded-2xl border border-daet-ink/10 bg-white p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-black text-daet-ink">Route</h2>
                  {route ? (
                    <p className="text-sm font-bold text-daet-forest">
                      {route.estimated ? "About " : ""}
                      {formatDistance(route.distanceM)} · {formatDuration(route.durationS)} of travel
                    </p>
                  ) : null}
                </div>
                <div className="mt-4">
                  <RouteMap points={mapPoints} polylines={route?.legs.map((leg) => leg.polyline) ?? []} connect title={`Route map for ${pkg.title}`} />
                </div>
                {route && route.legs.length > 0 ? (
                  <ol className="mt-4 space-y-1 text-sm text-daet-ink/75">
                    {route.legs.map((leg, i) => (
                      <li key={i}>
                        <span className="font-bold text-daet-ink">{mapPoints[i].label}</span> → <span className="font-bold text-daet-ink">{mapPoints[i + 1].label}</span>:{" "}
                        {leg.estimated ? "about " : ""}
                        {formatDistance(leg.distanceM)}, {formatDuration(leg.durationS)}
                      </li>
                    ))}
                  </ol>
                ) : null}
                {route?.estimated ? (
                  <p className="mt-2 text-xs text-daet-ink/55">Some distances are estimated from straight-line distance; actual roads and boat crossings may differ.</p>
                ) : null}
                {routeLink ? (
                  <a href={routeLink} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-daet-forest/30 px-5 text-sm font-bold text-daet-forest hover:bg-daet-forest/5">
                    Open route in Google Maps
                  </a>
                ) : null}
              </div>
            )}

            {/* Gallery */}
            {gallery.length > 0 && (
              <div className="mt-6 rounded-2xl border border-daet-ink/10 bg-white p-6">
                <h2 className="font-black text-daet-ink">Photo gallery</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {gallery.map((img: any) => (
                    <div key={img.id} className="overflow-hidden rounded-2xl bg-daet-sand">
                      <img
                        src={img.image_url}
                        alt={img.caption || "Package photo"}
                        className="aspect-video w-full object-cover"
                      />
                      {img.caption && (
                        <p className="p-3 text-xs text-daet-ink/60">{img.caption}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Operator info */}
            {pkg.tours_operators && Array.isArray(pkg.tours_operators) && pkg.tours_operators[0] && (
              <div className="mt-6 rounded-2xl border border-daet-ink/10 bg-white p-6">
                <h2 className="font-black text-daet-ink">Operated by</h2>
                <p className="mt-2 text-sm font-bold text-daet-forest">
                  {pkg.tours_operators[0].business_name}
                </p>
              </div>
            )}
          </div>

          {/* Sidebar - Booking card */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 rounded-3xl border border-daet-ink/10 bg-white p-6 shadow-lg">
              <div className="text-3xl font-black text-daet-ink">
                ₱{displayPrice.toLocaleString()}
                <span className="ml-2 text-sm font-normal text-daet-ink/60">{priceLabel}</span>
              </div>

              {pkg.tours_package_price_variants && pkg.tours_package_price_variants.length > 1 && (
                <p className="mt-2 text-xs text-daet-ink/60">
                  {pkg.tours_package_price_variants.length} pricing options available
                </p>
              )}

              <Link
                href={`/tours/packages/${pkg.id}/book`}
                className="mt-6 flex min-h-12 w-full items-center justify-center rounded-full bg-daet-forest text-sm font-black text-white transition hover:bg-daet-ink"
              >
                Book this experience
              </Link>

              <div className="mt-6 space-y-3 border-t border-daet-ink/10 pt-6 text-sm text-daet-ink/70">
                <div className="flex items-center gap-2">
                  <span>✓</span>
                  <span>Instant confirmation</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>✓</span>
                  <span>Free cancellation up to 24hrs</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>✓</span>
                  <span>Certified local guides</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageFrame>
  );
}
