// PROTOTYPE: layouts for /tours/browse, switchable via ?variant=A|B|C.
// Round 4: iterating on D (boarding pass). A = current grid, D = round-3 pass; B departures board, C scattered ticket desk, E tall die-cut tickets on a flight map.
// Rounds 1-3 are in this branch's git history.
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
  { key: "B", name: "Departures board" },
  { key: "C", name: "Tickets scattered on a desk" },
  { key: "D", name: "Boarding passes (round 3)" },
  { key: "E", name: "Die-cut tickets on a flight map" },
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

/** D: each trip is a boarding pass. Departure DAET, arrival the place; the price sits on a tear-off stub. */
const code = (s: string) => (s || "XXX").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
const amount = (pkg: Pkg) => priceText(pkg).split(" / ")[0];
const per = (pkg: Pkg) => priceText(pkg).split(" / ")[1] ?? "";
const barcode = "bg-[repeating-linear-gradient(90deg,currentColor_0_2px,transparent_2px_4px,currentColor_4px_5px,transparent_5px_8px)]";
/** Ticket notches cut by a mask, so the shape is real (shows whatever is behind it). */
const notched = (at: string, r = 14): React.CSSProperties => {
  const m = `radial-gradient(circle at ${at}, transparent ${r}px, #000 ${r + 1}px)`;
  return { WebkitMaskImage: m, maskImage: m };
};

/** B: an airport departures board. Split-flap tiles, amber on black; each row opens into a ticket on hover. */
export function VariantB({ packages, ratings }: Props) {
  const Flap = ({ text, w }: { text: string; w: number }) => (
    <span className="inline-flex gap-[2px]">
      {text.toUpperCase().padEnd(w).slice(0, w).split("").map((ch, i) => (
        <span key={i} className="relative inline-grid h-8 w-6 place-items-center overflow-hidden rounded-[3px] bg-[#1c1c1c] font-mono text-lg font-bold text-amber-300 shadow-[inset_0_-1px_0_#000] after:absolute after:inset-x-0 after:top-1/2 after:h-px after:bg-black/80">
          {ch === " " ? "\u00a0" : ch}
        </span>
      ))}
    </span>
  );
  const times = ["05:30", "06:00", "07:15", "08:40", "09:00", "13:20", "15:45"];
  return (
    <section className="-mx-4 mt-3 overflow-x-auto rounded-3xl bg-[#0b0b0b] p-4 text-amber-200 shadow-2xl sm:mx-0 sm:p-8">
      <header className="flex items-center justify-between border-b border-amber-300/20 pb-4">
        <h2 className="font-mono text-2xl font-black tracking-[.3em] text-amber-300">✈ DEPARTURES · DAET</h2>
        <span className="animate-pulse font-mono text-sm text-amber-300/70">● LIVE</span>
      </header>
      <div className="mt-3 hidden grid-cols-[6rem_1fr_9rem_8rem] gap-4 px-3 font-mono text-xs tracking-[.2em] text-amber-300/50 md:grid">
        <span>TIME</span><span>DESTINATION</span><span>FARE</span><span>STATUS</span>
      </div>
      <ul className="mt-2 space-y-2">
        {packages.map((pkg, i) => {
          const r = ratings.get(pkg.id);
          return (
            <li key={keyOf(pkg)}>
              <Link href={`/tours/packages/${pkg.id}`} className="group block rounded-xl p-3 transition hover:bg-amber-300/5">
                <div className="grid items-center gap-4 md:grid-cols-[6rem_1fr_9rem_8rem]">
                  <Flap text={times[i % times.length]} w={5} />
                  <div className="min-w-0"><Flap text={pkg.location_name} w={14} /></div>
                  <span className="font-mono text-lg font-bold text-amber-300">{amount(pkg)}</span>
                  <span className={`font-mono text-sm font-bold ${i % 3 === 0 ? "text-emerald-400" : "text-amber-300"}`}>{i % 3 === 0 ? "BOARDING" : "ON TIME"}</span>
                </div>
                <div className="grid grid-rows-[0fr] transition-all duration-500 group-hover:grid-rows-[1fr] group-focus-visible:grid-rows-[1fr]">
                  <div className="overflow-hidden">
                    <div className="mt-3 flex gap-4 rounded-lg bg-amber-300/10 p-3">
                      <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded"><Cover pkg={pkg} sizes="112px" /></div>
                      <div>
                        <p className="text-lg font-bold text-white">{pkg.title}</p>
                        <p className="font-mono text-sm text-amber-200/80">{days(pkg)} · {stars(r)} · {per(pkg)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** C: tickets tossed on a cork desk at odd angles and overlaps; hover pulls one to the top, straight. */
export function VariantC({ packages, ratings }: Props) {
  const spots = [
    "lg:col-start-1 lg:row-start-1 -rotate-6",
    "lg:col-start-3 lg:row-start-1 rotate-3 lg:translate-y-10",
    "lg:col-start-2 lg:row-start-2 -rotate-2 lg:-translate-y-16",
    "lg:col-start-1 lg:row-start-3 rotate-6 lg:-translate-y-10",
    "lg:col-start-3 lg:row-start-3 -rotate-3",
    "lg:col-start-2 lg:row-start-4 rotate-2 lg:-translate-y-20",
    "lg:col-start-1 lg:row-start-5 -rotate-1 lg:-translate-y-24",
  ];
  return (
    <div className="-mx-4 mt-3 overflow-hidden rounded-3xl bg-[#8a5a35] bg-[radial-gradient(#0002_1px,transparent_1.5px)] [background-size:6px_6px] p-6 sm:mx-0 sm:p-12">
      <ul className="grid gap-6 lg:grid-cols-[1fr_1fr_1fr] lg:gap-x-0">
        {packages.map((pkg, i) => (
          <li key={keyOf(pkg)} className={`${spots[i % spots.length]} relative transition duration-300 hover:z-20 hover:rotate-0 hover:scale-105 lg:col-span-2`}>
            <Link href={`/tours/packages/${pkg.id}`} className="flex bg-[#fbf7ee] shadow-[0_25px_40px_-15px_rgba(0,0,0,.6)]" style={notched("calc(100% - 7rem) 0", 0)}>
              <div className="flex-1 p-5">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[.3em] text-red-700">Admit one · Trip {String(i + 1).padStart(3, "0")}</p>
                <p className="mt-1 font-mono text-4xl font-black text-[#1d1a14]">DAE ✈ {code(pkg.location_name)}</p>
                <h2 className="mt-1 font-serif text-xl italic text-[#1d1a14]">{pkg.title}</h2>
                <p className="mt-2 font-mono text-xs uppercase text-[#1d1a14]/60">{days(pkg)} · {stars(ratings.get(pkg.id))}</p>
              </div>
              <div className="relative flex w-28 flex-col items-center justify-center border-l-2 border-dashed border-[#1d1a14]/30 bg-red-700 p-3 text-center text-[#fbf7ee]">
                <span className="text-[10px] uppercase tracking-widest">Fare</span>
                <span className="text-lg font-black">{amount(pkg)}</span>
                <span className="text-[10px] uppercase">{per(pkg)}</span>
                <span className="absolute -right-3 top-6 rotate-12 rounded-full border-4 border-double border-[#fbf7ee] px-2 py-0.5 text-[10px] font-black uppercase">Approved</span>
              </div>
            </Link>
            <span className="absolute -top-3 left-8 h-6 w-16 -rotate-6 bg-yellow-100/70 shadow" aria-hidden />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** E: tall die-cut tickets (real notches, scalloped stub) staggered over a dashed flight map of Camarines Norte. */
export function VariantE({ packages, ratings }: Props) {
  return (
    <div className="relative mt-3">
      <svg className="pointer-events-none absolute inset-0 h-full w-full text-blue-500/30" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden>
        <path d="M2 8 C 30 0, 20 40, 50 30 S 80 70, 98 55 M5 90 C 30 60, 60 95, 95 20" fill="none" stroke="currentColor" strokeWidth="0.3" strokeDasharray="1 1.2" vectorEffect="non-scaling-stroke" />
      </svg>
      <ul className="relative grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {packages.map((pkg, i) => (
          <li key={keyOf(pkg)} className={`${i % 2 ? "lg:mt-24" : ""} ${i % 4 === 2 ? "lg:-mt-6" : ""}`}>
            <Link href={`/tours/packages/${pkg.id}`} className="group block drop-shadow-[0_20px_25px_rgba(30,64,175,.25)] transition duration-500 hover:-translate-y-2 hover:rotate-[-1.5deg]">
              <div className="overflow-hidden rounded-t-[2rem] bg-blue-700 text-white" style={notched("50% 100%", 0)}>
                <div className="relative aspect-[3/4]">
                  <Cover pkg={pkg} sizes="(min-width:1024px) 25vw, 50vw" />
                  <div className="absolute inset-0 bg-gradient-to-b from-blue-900/70 via-transparent to-blue-900/90" />
                  <div className="absolute inset-x-0 top-0 flex justify-between p-5 font-mono">
                    <span><span className="block text-[10px] opacity-70">FROM</span><b className="text-3xl">DAE</b></span>
                    <span className="self-center text-xl transition-transform duration-700 group-hover:translate-x-3 group-hover:-translate-y-2">✈</span>
                    <span className="text-right"><span className="block text-[10px] opacity-70">TO</span><b className="text-3xl">{code(pkg.location_name)}</b></span>
                  </div>
                  <h2 className="absolute inset-x-0 bottom-0 p-5 text-2xl font-black leading-tight">{pkg.title}</h2>
                </div>
              </div>
              <div className="relative bg-white px-5 pb-6 pt-5 text-daet-ink dark:bg-slate-100" style={notched("0 0", 14)}>
                <span className="absolute -top-px left-4 right-4 border-t-2 border-dashed border-blue-200" />
                <div className="absolute -top-[14px] right-0 h-7 w-7 rounded-full bg-[var(--background,white)]" />
                <div className="flex items-end justify-between">
                  <div className="font-mono text-xs uppercase">
                    <p className="text-daet-ink/50">Length · Rating</p>
                    <p className="font-bold">{days(pkg)} · {stars(ratings.get(pkg.id))}</p>
                  </div>
                  <p className="text-right">
                    <span className="block text-2xl font-black text-blue-700">{amount(pkg)}</span>
                    <span className="text-xs uppercase text-daet-ink/60">{per(pkg)}</span>
                  </p>
                </div>
                <div className={`mt-4 h-8 text-daet-ink ${barcode}`} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function VariantD({ packages, ratings }: Props) {
  const _code = (s: string) => (s || "XXX").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
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

