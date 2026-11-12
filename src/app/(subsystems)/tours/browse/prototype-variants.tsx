// PROTOTYPE: three layouts for /tours/browse, switchable via ?variant=A|B|C.
// Round 2: iterating on A (photo grid). A = current, B/C/D = grid refinements.
// Round 1 (compare list, shelves by place) is in this branch's git history.
// Question: what should the trip list look like? Throwaway; lives on branch prototype/tours-browse-layouts.
import Image from "next/image";
import Link from "next/link";
import { PackageCard } from "@/components/tours/package-card";
import { formatPeso } from "@/lib/money";
import { PHOTOS } from "@/lib/photo-credits";
import type { RatingSummary } from "@/lib/tours/reviews";
import { durationLabel, fromPrice, placePhoto } from "@/lib/tours/trip-board";

type Pkg = any;
type Props = { packages: Pkg[]; ratings: Map<string, RatingSummary> };

export const VARIANTS = [
  { key: "A", name: "Grid (current)" },
  { key: "B", name: "Grid, text on photo" },
  { key: "C", name: "Grid, big first trip" },
  { key: "D", name: "Grid, no card boxes" },
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

/** PROTOTYPE: mock data has 1 trip; repeat it so grids can be judged. Real data is untouched. */
export function padForDemo(packages: Pkg[]): Pkg[] {
  if (packages.length === 0 || packages.length >= 6) return packages;
  return Array.from({ length: 7 }, (_, i) => ({ ...packages[i % packages.length], _key: `${packages[i % packages.length].id}-${i}` }));
}
const keyOf = (p: Pkg) => p._key ?? p.id;

function Facts({ pkg, rating, light = false }: { pkg: Pkg; rating?: RatingSummary; light?: boolean }) {
  return (
    <p className={`text-sm ${light ? "text-white/90" : "text-daet-ink/75"}`}>
      {pkg.location_name} · {durationLabel(pkg.duration_value, pkg.duration_type)}
      {rating ? ` · ★ ${rating.average.toFixed(1)} (${rating.count})` : " · New"}
    </p>
  );
}

/** A: today's grid, the baseline. */
export function VariantA({ packages, ratings }: Props) {
  return (
    <ul className="mt-3 grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
      {packages.map((pkg) => (
        <li key={keyOf(pkg)}>
          <PackageCard package={pkg} rating={ratings.get(pkg.id) ?? null} />
        </li>
      ))}
    </ul>
  );
}

/** B: tall photos with title and facts on the photo; price as a chip. Photo-led, fewer boxes. */
export function VariantB({ packages, ratings }: Props) {
  return (
    <ul className="mt-3 grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
      {packages.map((pkg) => (
        <li key={keyOf(pkg)}>
          <Link href={`/tours/packages/${pkg.id}`} className="group relative block aspect-[3/4] overflow-hidden rounded-2xl">
            <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-105">
              <Cover pkg={pkg} sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
            <span className="absolute right-3 top-3 rounded-full bg-white px-3 py-1 text-sm font-bold text-daet-ink shadow">
              {priceText(pkg)}
            </span>
            <div className="absolute inset-x-0 bottom-0 p-5">
              <h2 className="text-2xl font-bold leading-tight text-white">{pkg.title}</h2>
              <div className="mt-1"><Facts pkg={pkg} rating={ratings.get(pkg.id)} light /></div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** C: today's cards, but the best-rated trip takes a 2x2 tile so the grid has a focal point. */
export function VariantC({ packages, ratings }: Props) {
  const score = (p: Pkg) => ratings.get(p.id)?.average ?? 0;
  const sorted = [...packages].sort((a, b) => score(b) - score(a));
  return (
    <ul className="mt-3 grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
      {sorted.map((pkg, i) => (
        <li key={keyOf(pkg)} className={i === 0 ? "sm:col-span-2 sm:row-span-2" : ""}>
          {i === 0 ? (
            <Link href={`/tours/packages/${pkg.id}`} className="group relative block h-full min-h-80 overflow-hidden rounded-2xl">
              <Cover pkg={pkg} sizes="66vw" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
              <div className="absolute bottom-0 p-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Top rated</p>
                <h2 className="text-3xl font-bold text-white sm:text-4xl">{pkg.title}</h2>
                <Facts pkg={pkg} rating={ratings.get(pkg.id)} light />
                <p className="mt-2 text-lg font-bold text-white">{priceText(pkg)}</p>
              </div>
            </Link>
          ) : (
            <PackageCard package={pkg} rating={ratings.get(pkg.id) ?? null} />
          )}
        </li>
      ))}
    </ul>
  );
}

/** D: no card borders, square photos, short text underneath, 4 across on wide screens. Lighter and denser. */
export function VariantD({ packages, ratings }: Props) {
  return (
    <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">
      {packages.map((pkg) => {
        const rating = ratings.get(pkg.id);
        return (
          <li key={keyOf(pkg)}>
            <Link href={`/tours/packages/${pkg.id}`} className="group block">
              <div className="relative aspect-square overflow-hidden rounded-xl">
                <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-105">
                  <Cover pkg={pkg} sizes="(min-width:1024px) 25vw, 50vw" />
                </div>
              </div>
              <div className="mt-2 flex items-start justify-between gap-2">
                <h2 className="font-semibold leading-snug text-daet-ink">{pkg.title}</h2>
                <span className="shrink-0 text-sm">{rating ? `★ ${rating.average.toFixed(1)}` : "New"}</span>
              </div>
              <p className="text-sm text-daet-ink/70">{pkg.location_name} · {durationLabel(pkg.duration_value, pkg.duration_type)}</p>
              <p className="mt-1 text-sm"><span className="font-bold text-daet-ink">{priceText(pkg)}</span></p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
