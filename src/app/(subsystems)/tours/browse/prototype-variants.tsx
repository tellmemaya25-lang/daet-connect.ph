// PROTOTYPE: three layouts for /tours/browse, switchable via ?variant=A|B|C.
// Question: what should the trip list look like? Throwaway; lives on branch prototype/tours-browse-layouts.
import Image from "next/image";
import Link from "next/link";
import { PackageCard } from "@/components/tours/package-card";
import { RatingBadge } from "@/components/tours/star-rating";
import { formatPeso } from "@/lib/money";
import { PHOTOS } from "@/lib/photo-credits";
import type { RatingSummary } from "@/lib/tours/reviews";
import { durationLabel, fromPrice, placePhoto } from "@/lib/tours/trip-board";

type Pkg = any;
type Props = { packages: Pkg[]; ratings: Map<string, RatingSummary> };

export const VARIANTS = [
  { key: "A", name: "Photo grid (current)" },
  { key: "B", name: "Compare list" },
  { key: "C", name: "By place, with a featured trip" },
];

function Cover({ pkg, sizes }: { pkg: Pkg; sizes: string }) {
  if (pkg.cover_image_url) return <img src={pkg.cover_image_url} alt={pkg.title} className="h-full w-full object-cover" />;
  const p = PHOTOS[placePhoto(pkg.title, pkg.location_name)];
  return <Image src={p.src} alt={`${pkg.location_name}: ${p.alt}`} fill sizes={sizes} className="object-cover" />;
}

function priceText(pkg: Pkg) {
  const price = fromPrice(pkg.tours_package_price_variants);
  return price ? `${formatPeso(price.amount)}${price.perPerson ? " / person" : " / group"}` : "Ask the operator";
}

/** A: today's layout, kept as the baseline. */
export function VariantA({ packages, ratings }: Props) {
  return (
    <ul className="mt-3 grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
      {packages.map((pkg) => (
        <li key={pkg.id}>
          <PackageCard package={pkg} rating={ratings.get(pkg.id) ?? null} />
        </li>
      ))}
    </ul>
  );
}

/** B: dense rows for comparing price, length and rating side by side. Small thumbnail, price is the anchor. */
export function VariantB({ packages, ratings }: Props) {
  return (
    <div className="mt-3 overflow-hidden rounded-2xl card-edge bg-surface">
      <div className="hidden grid-cols-[4rem_1fr_8rem_8rem_10rem] gap-4 border-b px-4 py-2 text-sm font-semibold text-daet-ink/70 sm:grid">
        <span />
        <span>Trip</span>
        <span>Length</span>
        <span>Rating</span>
        <span className="text-right">From</span>
      </div>
      <ul className="divide-y">
        {packages.map((pkg) => {
          const rating = ratings.get(pkg.id);
          return (
            <li key={pkg.id}>
              <Link
                href={`/tours/packages/${pkg.id}`}
                className="grid grid-cols-[4rem_1fr] items-center gap-4 px-4 py-3 hover:bg-daet-ink/5 sm:grid-cols-[4rem_1fr_8rem_8rem_10rem]"
              >
                <div className="relative h-16 w-16 overflow-hidden rounded-lg">
                  <Cover pkg={pkg} sizes="64px" />
                </div>
                <div>
                  <h2 className="font-semibold text-daet-ink">{pkg.title}</h2>
                  <p className="text-sm text-daet-ink/70">{pkg.location_name}</p>
                  <p className="text-sm sm:hidden">
                    {durationLabel(pkg.duration_value, pkg.duration_type)} · {priceText(pkg)}
                  </p>
                </div>
                <span className="hidden sm:block">{durationLabel(pkg.duration_value, pkg.duration_type)}</span>
                <span className="hidden sm:block">{rating ? <RatingBadge summary={rating} /> : "New"}</span>
                <span className="hidden text-right font-bold sm:block">{priceText(pkg)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** C: one big featured trip (best rated), then horizontal shelves grouped by place. */
export function VariantC({ packages, ratings }: Props) {
  const score = (p: Pkg) => ratings.get(p.id)?.average ?? 0;
  const featured = [...packages].sort((a, b) => score(b) - score(a))[0];
  const byPlace = new Map<string, Pkg[]>();
  for (const p of packages) {
    if (p === featured) continue;
    const key = p.location_name || "Other";
    byPlace.set(key, [...(byPlace.get(key) ?? []), p]);
  }
  return (
    <div className="mt-3 space-y-10">
      {featured ? (
        <Link href={`/tours/packages/${featured.id}`} className="relative block h-80 overflow-hidden rounded-3xl sm:h-[28rem]">
          <Cover pkg={featured} sizes="100vw" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute bottom-0 p-6 text-white sm:p-10">
            <p className="text-sm font-semibold uppercase tracking-wide">Top rated</p>
            <h2 className="mt-1 text-3xl font-bold sm:text-5xl">{featured.title}</h2>
            <p className="mt-2 text-lg">
              {featured.location_name} · {durationLabel(featured.duration_value, featured.duration_type)} · {priceText(featured)}
            </p>
          </div>
        </Link>
      ) : null}
      {[...byPlace].map(([place, list]) => (
        <section key={place}>
          <h2 className="text-xl font-bold text-daet-ink">
            {place} <span className="font-normal text-daet-ink/60">· {list.length}</span>
          </h2>
          <ul className="mt-3 flex snap-x gap-4 overflow-x-auto pb-2">
            {list.map((pkg) => (
              <li key={pkg.id} className="w-64 shrink-0 snap-start">
                <Link href={`/tours/packages/${pkg.id}`} className="block">
                  <div className="relative aspect-square overflow-hidden rounded-2xl">
                    <Cover pkg={pkg} sizes="256px" />
                  </div>
                  <h3 className="mt-2 font-semibold text-daet-ink">{pkg.title}</h3>
                  <p className="text-sm text-daet-ink/70">
                    {durationLabel(pkg.duration_value, pkg.duration_type)} · {priceText(pkg)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
