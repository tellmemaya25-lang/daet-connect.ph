import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PackageCard } from "./package-card";
import { toSummary, type RatingSummary } from "@/lib/tours/reviews";
import { PackageFilters } from "./package-filters";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  location?: string;
  minPrice?: string;
  maxPrice?: string;
  duration?: string;
  sort?: string;
}>;

export default async function BrowsePackagesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">
          Configure Supabase to browse tour packages.
        </Notice>
      </PageFrame>
    );
  }

  const params = await searchParams;
  const supabase = await createSupabaseServerClient();

  // Build query - get packages with their price variants (using nested query for better performance)
  let query = supabase
    .from("tours_packages")
    .select(
      `
      id,
      title,
      location_name,
      duration_value,
      duration_type,
      cover_image_url,
      created_at,
      status,
      tours_package_price_variants(price_per_pax, flat_price, is_default)
    `,
    )
    .eq("status", "published");

  // Apply filters
  if (params.location) {
    query = query.ilike("location_name", `%${params.location}%`);
  }

  if (params.duration) {
    const [value, type] = params.duration.split("-");
    query = query.eq("duration_value", parseInt(value)).eq("duration_type", type);
  }

  // Apply sorting
  const sortBy = params.sort || "created_at";
  query = query.order(sortBy === "price" ? "created_at" : sortBy, { ascending: sortBy === "price" });

  const { data: packages, error } = await query.limit(50);

  if (error) {
    console.error("Browse packages error:", error);
    console.error("Error details:", JSON.stringify(error, null, 2));
    return (
      <PageFrame>
        <div className="mx-auto max-w-7xl">
          <Notice variant="error" title="Could not load packages">
            {error.message || error.details || "Please try again later."}
          </Notice>
        </div>
      </PageFrame>
    );
  }

  const packagesWithPricing = packages || [];

  // Ratings come from a view so hidden reviews never count.
  const ratingsById = new Map<string, RatingSummary>();
  if (packagesWithPricing.length > 0) {
    const { data: ratingRows } = await supabase
      .from("tours_package_ratings")
      .select("package_id, review_count, average_rating")
      .in("package_id", packagesWithPricing.map((pkg) => pkg.id));
    for (const row of ratingRows ?? []) {
      const summary = toSummary(row);
      if (row.package_id && summary) ratingsById.set(row.package_id, summary);
    }
  }

  // Check if user is logged in
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Filter by price range
  let filteredPackages = packagesWithPricing;
  if (params.minPrice || params.maxPrice) {
    const minPrice = params.minPrice ? parseFloat(params.minPrice) : 0;
    const maxPrice = params.maxPrice ? parseFloat(params.maxPrice) : Infinity;

    filteredPackages = packagesWithPricing.filter((pkg: any) => {
      const defaultVariant = pkg.tours_package_price_variants?.find((v: any) => v.is_default);
      if (!defaultVariant) return true; // Include packages without pricing
      const price = defaultVariant.price_per_pax || defaultVariant.flat_price || 0;
      return price >= minPrice && price <= maxPrice;
    });
  }

  return (
    <PageFrame>
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-daet-leaf">
              Explore Daet
            </p>
            <h1 className="mt-2 text-3xl font-black text-daet-ink sm:text-4xl">
              Tour Packages
            </h1>
            <p className="mt-2 text-sm leading-6 text-daet-ink/65">
              Discover authentic experiences with local operators and certified guides.
            </p>
          </div>
          {user && (
            <Link
              href="/tours/my-bookings"
              className="rounded-full bg-daet-forest px-6 py-3 text-sm font-bold text-white transition hover:bg-daet-ink"
            >
              My Bookings
            </Link>
          )}
        </div>

        {/* Filters */}
        <PackageFilters currentParams={params} />

        {/* Results */}
        {filteredPackages.length === 0 ? (
          <section className="mt-8 rounded-3xl border border-daet-ink/10 bg-white px-6 py-14 text-center shadow-sm">
            <span
              className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-daet-sand text-2xl"
              aria-hidden="true"
            >
              🔍
            </span>
            <h2 className="mt-4 text-xl font-black text-daet-ink">No packages found</h2>
            <p className="mt-2 text-sm text-daet-ink/70">
              Try adjusting your filters or check back later for new tours.
            </p>
          </section>
        ) : (
          <>
            <p className="mt-6 text-sm text-daet-ink/70">
              {filteredPackages.length} package{filteredPackages.length !== 1 ? "s" : ""} available
            </p>
            <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredPackages.map((pkg: any) => (
                <PackageCard key={pkg.id} package={pkg} rating={ratingsById.get(pkg.id) ?? null} />
              ))}
            </div>
          </>
        )}
      </div>
    </PageFrame>
  );
}
