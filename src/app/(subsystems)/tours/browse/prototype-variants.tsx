// PROTOTYPE: layouts for /tours/browse, switchable via ?variant=A|B|C.
// Round 5: iterating on E (tall die-cut ticket). Airport codes removed; symmetric tear notches.
// A = current grid; E = refined ticket; B = ticket with info chips; C = tear-off reveal; D = ticket rail.
// Rounds 1-4 are in this branch's git history.
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
  { key: "E", name: "Ticket, refined" },
  { key: "B", name: "Ticket + info chips" },
  { key: "C", name: "Ticket, tear-off reveal" },
  { key: "D", name: "Ticket rail" },
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

const amount = (pkg: Pkg) => priceText(pkg).split(" / ")[0];
const per = (pkg: Pkg) => priceText(pkg).split(" / ")[1] ?? "";
const barcode = "bg-[repeating-linear-gradient(90deg,currentColor_0_2px,transparent_2px_4px,currentColor_4px_5px,transparent_5px_8px)]";

/** The tear line: one row with matching half-circle cut-outs on BOTH edges (a real mask, so the page shows through). */
const R = 14;
const tearMask: React.CSSProperties = (() => {
  const m = `radial-gradient(circle at 0 50%, transparent ${R}px, #000 ${R + 0.5}px) left / 51% 100% no-repeat, radial-gradient(circle at 100% 50%, transparent ${R}px, #000 ${R + 0.5}px) right / 51% 100% no-repeat`;
  return { WebkitMask: m, mask: m, height: R * 2 };
})();
function TearLine({ tone = "bg-white dark:bg-slate-100" }: { tone?: string }) {
  return (
    <div className={`relative ${tone}`} style={tearMask} aria-hidden>
      <span className="absolute inset-x-5 top-1/2 border-t-2 border-dashed border-blue-200" />
    </div>
  );
}

type TicketOpts = { chips?: boolean; tearOff?: boolean; className?: string };
function Ticket({ pkg, rating, opts = {} }: { pkg: Pkg; rating?: RatingSummary; opts?: TicketOpts }) {
  return (
    <Link
      href={`/tours/packages/${pkg.id}`}
      className={`group block drop-shadow-[0_20px_25px_rgba(30,64,175,.22)] transition duration-500 hover:-translate-y-2 ${opts.tearOff ? "" : "hover:rotate-[-1.5deg]"} ${opts.className ?? ""}`}
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-t-[2rem] bg-blue-700 text-white">
        <Cover pkg={pkg} sizes="(min-width:1024px) 25vw, 80vw" />
        <div className="absolute inset-0 bg-gradient-to-b from-blue-950/40 via-transparent to-blue-950/90" />
        <p className="absolute left-5 top-5 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
          📍 {pkg.location_name}
        </p>
        {opts.chips ? (
          <div className="absolute right-5 top-5 grid h-14 w-14 place-items-center rounded-full bg-amber-300 text-center text-blue-950 shadow-lg rotate-12">
            <span className="text-sm font-black leading-none">{rating ? rating.average.toFixed(1) : "New"}<span className="block text-[9px] font-bold uppercase">{rating ? `${rating.count} reviews` : "trip"}</span></span>
          </div>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 p-5">
          <h2 className="text-2xl font-black leading-tight">{pkg.title}</h2>
          {opts.chips ? (
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-white/20 px-2.5 py-1 backdrop-blur">⏱ {days(pkg)}</span>
              <span className="rounded-full bg-white/20 px-2.5 py-1 backdrop-blur">🧭 Accredited guide</span>
            </div>
          ) : null}
        </div>
      </div>
      <div className={opts.tearOff ? "origin-top-left transition duration-500 group-hover:translate-y-2 group-hover:rotate-[4deg]" : ""}>
        <TearLine />
        <div className="rounded-b-xl bg-white px-5 pb-5 pt-1 text-daet-ink dark:bg-slate-100">
          <div className="flex items-end justify-between gap-3">
            {opts.chips ? (
              <span className="text-xs uppercase tracking-wider text-daet-ink/60">From</span>
            ) : (
              <div className="font-mono text-xs uppercase">
                <p className="text-daet-ink/50">Length · Rating</p>
                <p className="font-bold">{days(pkg)} · {stars(rating)}</p>
              </div>
            )}
            <p className="text-right">
              <span className="block text-2xl font-black text-blue-700">{amount(pkg)}</span>
              <span className="text-xs uppercase text-daet-ink/60">{per(pkg)}</span>
            </p>
          </div>
          {opts.tearOff ? (
            <div className="mt-4 grid h-10 place-items-center rounded-lg bg-blue-700 text-sm font-bold text-white opacity-0 transition group-hover:opacity-100">See dates & book →</div>
          ) : (
            <div className={`mt-4 h-8 text-daet-ink ${barcode}`} />
          )}
        </div>
      </div>
    </Link>
  );
}

function Staggered({ packages, ratings, opts }: Props & { opts?: TicketOpts }) {
  return (
    <ul className="relative mt-3 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
      {packages.map((pkg, i) => (
        <li key={keyOf(pkg)} className={i % 2 ? "lg:mt-20" : ""}>
          <Ticket pkg={pkg} rating={ratings.get(pkg.id)} opts={opts} />
        </li>
      ))}
    </ul>
  );
}

/** E: the round-4 ticket, refined: place instead of airport codes, matching notches both sides. */
export function VariantE(p: Props) {
  return <Staggered {...p} />;
}

/** B: the ticket carries the decision facts on the photo (length, guide) and a rating seal; the stub is only price. */
export function VariantB(p: Props) {
  return <Staggered {...p} opts={{ chips: true }} />;
}

/** C: hovering tears the stub slightly away and turns the barcode into a booking button. */
export function VariantC(p: Props) {
  return <Staggered {...p} opts={{ tearOff: true }} />;
}

/** D: tickets on a horizontal rail with snap scrolling, phone-first; big tickets, one-and-a-bit visible on a phone. */
export function VariantD({ packages, ratings }: Props) {
  return (
    <ul className="-mx-4 mt-3 flex snap-x snap-mandatory gap-6 overflow-x-auto px-4 pb-8 pt-4 [scrollbar-width:none]">
      {packages.map((pkg, i) => (
        <li key={keyOf(pkg)} className={`w-[78%] shrink-0 snap-center sm:w-80 ${i % 2 ? "translate-y-6" : ""}`}>
          <Ticket pkg={pkg} rating={ratings.get(pkg.id)} opts={{ chips: true }} />
        </li>
      ))}
    </ul>
  );
}
