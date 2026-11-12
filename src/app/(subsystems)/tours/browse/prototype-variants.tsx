// PROTOTYPE: layouts for /tours/browse, switchable via ?variant=A|B|C.
// Round 3: bold takes on the grid. A = current; B postcards, C magazine spread, D boarding passes, E tide-chart strips.
// Rounds 1-2 are in this branch's git history.
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
  { key: "B", name: "Postcards" },
  { key: "C", name: "Magazine spread" },
  { key: "D", name: "Boarding passes" },
  { key: "E", name: "Sunset strips" },
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

const stars = (r?: RatingSummary) => (r ? `★ ${r.average.toFixed(1)}` : "New");
const days = (pkg: Pkg) => durationLabel(pkg.duration_value, pkg.duration_type);

/** B: tilted postcards on a sandy table. Price is a postage stamp; they straighten and lift on hover. */
export function VariantB({ packages, ratings }: Props) {
  const tilt = ["-rotate-2", "rotate-1", "-rotate-1", "rotate-2", "rotate-0", "-rotate-3", "rotate-3"];
  return (
    <div className="-mx-4 mt-3 rounded-3xl bg-[radial-gradient(circle_at_20%_10%,#fdf3dc,#f3e2bd_60%,#e8d1a3)] px-6 py-12 sm:mx-0 dark:bg-[radial-gradient(circle_at_20%_10%,#3a3020,#2a2216)]">
      <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((pkg, i) => (
          <li key={keyOf(pkg)} className={`${tilt[i % tilt.length]} transition duration-300 hover:z-10 hover:rotate-0 hover:-translate-y-2 hover:scale-[1.03]`}>
            <Link href={`/tours/packages/${pkg.id}`} className="block bg-[#fffdf7] p-3 pb-5 shadow-[0_18px_30px_-12px_rgba(60,40,10,.45)]">
              <div className="relative aspect-[4/3] overflow-hidden">
                <Cover pkg={pkg} sizes="(min-width:1024px) 33vw, 100vw" />
                <span className="absolute right-2 top-2 rotate-6 border-2 border-dashed border-red-700 bg-[#fffdf7] px-2 py-1 text-center font-mono text-xs font-bold leading-tight text-red-700">
                  {priceText(pkg).replace(" / ", "\n/ ")}
                </span>
                <span className="absolute bottom-2 left-2 -rotate-6 rounded-full border-2 border-white/80 px-3 py-1 text-[10px] font-bold uppercase tracking-[.2em] text-white/90">
                  {pkg.location_name} · PH
                </span>
              </div>
              <h2 className="mt-3 font-serif text-2xl italic text-[#2b2116]">Greetings from {pkg.title}!</h2>
              <p className="mt-1 border-t border-dashed border-[#2b2116]/30 pt-2 font-mono text-xs uppercase tracking-wider text-[#2b2116]/70">
                {days(pkg)} · {stars(ratings.get(pkg.id))}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** C: editorial magazine spread. Huge issue numbers, asymmetric sizes, mixed aspect ratios, serif headlines. */
export function VariantC({ packages, ratings }: Props) {
  const spans = ["lg:col-span-4 lg:row-span-2", "lg:col-span-2", "lg:col-span-2", "lg:col-span-3", "lg:col-span-3", "lg:col-span-2", "lg:col-span-4"];
  return (
    <ol className="mt-3 grid auto-rows-[minmax(14rem,auto)] gap-6 border-t-4 border-daet-ink pt-6 sm:grid-cols-2 lg:grid-cols-6">
      {packages.map((pkg, i) => {
        const big = i === 0;
        return (
          <li key={keyOf(pkg)} className={spans[i % spans.length]}>
            <Link href={`/tours/packages/${pkg.id}`} className="group flex h-full flex-col">
              <div className={`relative overflow-hidden grayscale-[60%] transition duration-500 group-hover:grayscale-0 ${big ? "min-h-[24rem] flex-1" : "aspect-[5/4]"}`}>
                <Cover pkg={pkg} sizes="(min-width:1024px) 66vw, 100vw" />
                <span className="absolute left-3 top-0 font-serif text-[7rem] font-black leading-none text-white drop-shadow-[0_4px_12px_rgba(0,0,0,.5)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-4 border-b border-daet-ink/20 pb-3">
                <h2 className={`font-serif leading-[1.05] text-daet-ink group-hover:underline ${big ? "text-5xl" : "text-2xl"}`}>{pkg.title}</h2>
                <span className="shrink-0 text-xs font-bold uppercase tracking-[.2em] text-daet-ink/60">{days(pkg)}</span>
              </div>
              <p className="mt-2 text-sm uppercase tracking-[.15em] text-daet-ink/70">
                {pkg.location_name} — {stars(ratings.get(pkg.id))} — <b className="text-daet-ink">{priceText(pkg)}</b>
              </p>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/** D: each trip is a boarding pass. Departure DAET, arrival the place; the price sits on a tear-off stub. */
export function VariantD({ packages, ratings }: Props) {
  const code = (s: string) => (s || "XXX").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
  return (
    <ul className="mt-3 grid gap-6 lg:grid-cols-2">
      {packages.map((pkg, i) => (
        <li key={keyOf(pkg)}>
          <Link href={`/tours/packages/${pkg.id}`} className="group flex overflow-hidden rounded-2xl bg-surface shadow-lg ring-1 ring-daet-ink/10 transition hover:-translate-y-1 hover:shadow-2xl">
            <div className="relative w-28 shrink-0 sm:w-40">
              <Cover pkg={pkg} sizes="160px" />
            </div>
            <div className="flex-1 p-5">
              <p className="text-[10px] font-bold uppercase tracking-[.3em] text-blue-600">Boarding pass · Trip {String(i + 1).padStart(3, "0")}</p>
              <div className="mt-2 flex items-center gap-3 font-mono text-3xl font-black text-daet-ink">
                <span>DAE</span>
                <span className="relative h-px flex-1 bg-daet-ink/30"><span className="absolute -top-3 left-1/2 -translate-x-1/2 text-base transition-all duration-700 group-hover:left-full">✈</span></span>
                <span>{code(pkg.location_name)}</span>
              </div>
              <h2 className="mt-2 font-semibold text-daet-ink">{pkg.title}</h2>
              <dl className="mt-3 grid grid-cols-3 gap-2 font-mono text-xs uppercase">
                <div><dt className="text-daet-ink/50">Length</dt><dd className="font-bold text-daet-ink">{days(pkg)}</dd></div>
                <div><dt className="text-daet-ink/50">Rating</dt><dd className="font-bold text-daet-ink">{stars(ratings.get(pkg.id))}</dd></div>
                <div><dt className="text-daet-ink/50">Gate</dt><dd className="font-bold text-daet-ink">{pkg.location_name}</dd></div>
              </dl>
            </div>
            <div className="relative flex w-28 shrink-0 flex-col items-center justify-center border-l-2 border-dashed border-daet-ink/25 bg-blue-600 p-3 text-center text-white sm:w-32">
              <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-[var(--background,white)]" />
              <span className="absolute -bottom-3 -left-3 h-6 w-6 rounded-full bg-[var(--background,white)]" />
              <span className="text-[10px] uppercase tracking-widest opacity-80">From</span>
              <span className="text-xl font-black leading-tight">{priceText(pkg).split(" / ")[0]}</span>
              <span className="text-[10px] uppercase opacity-80">{priceText(pkg).split(" / ")[1] ?? ""}</span>
              <span className="mt-3 h-6 w-full bg-[repeating-linear-gradient(90deg,#fff_0_2px,transparent_2px_4px,#fff_4px_5px,transparent_5px_8px)] opacity-80" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** E: full-width cinematic strips; hovering one expands it and the rest compress, like an accordion of sunsets. */
export function VariantE({ packages, ratings }: Props) {
  const hues = ["from-orange-500/70", "from-pink-600/70", "from-violet-700/70", "from-sky-700/70", "from-teal-700/70"];
  return (
    <ul className="mt-3 flex h-[34rem] flex-col gap-2 lg:h-[30rem] lg:flex-row">
      {packages.map((pkg, i) => (
        <li key={keyOf(pkg)} className="group relative min-h-12 flex-1 overflow-hidden rounded-2xl transition-[flex-grow] duration-700 ease-out hover:flex-[5] focus-within:flex-[5]">
          <Link href={`/tours/packages/${pkg.id}`} className="absolute inset-0 block">
            <Cover pkg={pkg} sizes="100vw" />
            <div className={`absolute inset-0 bg-gradient-to-t ${hues[i % hues.length]} to-transparent mix-blend-multiply`} />
            <div className="absolute inset-0 bg-black/30 transition group-hover:bg-black/10" />
            <span className="absolute left-3 top-3 font-mono text-xs font-bold text-white/80 lg:[writing-mode:vertical-rl]">{String(i + 1).padStart(2, "0")} · {pkg.location_name}</span>
            <div className="absolute inset-x-0 bottom-0 translate-y-4 p-6 opacity-0 transition duration-500 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:opacity-100">
              <h2 className="text-3xl font-black text-white sm:text-4xl">{pkg.title}</h2>
              <p className="mt-1 text-white/90">{days(pkg)} · {stars(ratings.get(pkg.id))} · <b>{priceText(pkg)}</b></p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
