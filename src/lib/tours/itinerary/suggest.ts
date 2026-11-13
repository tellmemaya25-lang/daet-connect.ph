import { haversineMeters, type LatLng } from "@/lib/maps/geo";

/** Published packages whose stops pass near the planned attractions ("Book matching tours"). */

export const MATCH_RADIUS_M = 1500;

export type PackageCandidate = { id: string; title: string; coverImageUrl: string | null; stops: Array<LatLng & { name: string }> };
export type PackageMatch = {
  id: string;
  title: string;
  coverImageUrl: string | null;
  matched: string[];
  /** The planned place most of the tour's stops go to: what the tour is mainly about. */
  primary?: string;
};

/** "Bagasbas Beach – Main Entrance!" → "bagasbas beach main entrance". */
const normalName = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * A package stop goes to a planned place when it is within MATCH_RADIUS_M, or
 * when it is named for it ("Bagasbas Beach", "Bagasbas Beach Main Entrance").
 * The name counts because operators often leave a stop's pin on the town
 * centre, kilometres from the place it names.
 */
export function stopReachesPlace(place: LatLng & { name: string }, stop: LatLng & { name: string }): boolean {
  return haversineMeters(place, stop) <= MATCH_RADIUS_M || namedFor(place, stop);
}

/** Words too common in Camarines Norte place names to tell two places apart. */
const GENERIC = new Set(
  "daet camarines norte beach town proper plaza center centre area park river island islands falls church cathedral most holy the and of sa ng main entrance road street boulevard tour tours trip experience day night"
    .split(" "),
);

/** "Aquino Bagasbas Boulevard" → ["aquino", "bagasbas"]: the words that name a particular place. */
const distinctive = (name: string) => normalName(name).split(" ").filter((w) => w.length >= 4 && !GENERIC.has(w));

/** The stop (or a tour title) is named for the place: the whole name, or one of its distinctive words. */
function namedFor(place: { name: string }, stop: { name: string }): boolean {
  const p = normalName(place.name);
  const s = normalName(stop.name);
  if (p.length >= 6 && s.length >= 6 && (s === p || s.startsWith(`${p} `) || p.startsWith(`${s} `))) return true;
  const words = new Set(normalName(stop.name).split(" "));
  return distinctive(place.name).some((w) => words.has(w));
}

/** The one planned place a stop is for: the place it is named after, else the nearest one in range. */
function placeOfStop<P extends LatLng & { name: string }>(stop: LatLng & { name: string }, places: P[]): P | null {
  const named = places.find((place) => namedFor(place, stop));
  if (named) return named;
  let best: P | null = null;
  let bestMeters = MATCH_RADIUS_M;
  for (const place of places) {
    const m = haversineMeters(place, stop);
    if (m <= bestMeters) {
      best = place;
      bestMeters = m;
    }
  }
  return best;
}

export function matchPackages(places: Array<LatLng & { name: string }>, packages: PackageCandidate[], limit = 3): PackageMatch[] {
  return packages
    .map((pkg) => {
      const matched = places.filter((place) => pkg.stops.some((stop) => stopReachesPlace(place, stop))).map((p) => p.name);
      const owners = pkg.stops.map((stop) => placeOfStop(stop, places)?.name);
      const reach = places.map((place) => ({ name: place.name, stops: owners.filter((n) => n === place.name).length }));
      // A place the title names ("Bagasbas Beach Surf & Chill") is what the tour is
      // about; else the place most of its stops are for (a tie goes to the plan's order).
      const titled = places.find((place) => matched.includes(place.name) && namedFor(place, { name: pkg.title }))?.name;
      const primary = titled ?? reach.reduce<{ name: string; stops: number } | null>((best, r) => (r.stops > (best?.stops ?? 0) ? r : best), null)?.name;
      return { id: pkg.id, title: pkg.title, coverImageUrl: pkg.coverImageUrl, matched: [...new Set(matched)], primary };
    })
    .filter((match) => match.matched.length > 0)
    .sort((a, b) => b.matched.length - a.matched.length || a.title.localeCompare(b.title))
    .slice(0, limit);
}

/**
 * Other packages that pass the same planned places as `main` ("Similar
 * choices"): the tourist can compare operators and prices for the same stops.
 * Excludes `main` and anything already shown; most shared places first.
 */
export function similarPackages(
  main: PackageMatch,
  places: Array<LatLng & { name: string }>,
  candidates: PackageCandidate[],
  exclude: ReadonlySet<string>,
): Array<{ id: string; shared: string[] }> {
  const targets = places.filter((p) => main.matched.includes(p.name));
  return candidates
    .filter((c) => c.id !== main.id && !exclude.has(c.id))
    .map((c) => ({
      id: c.id,
      shared: [...new Set(targets.filter((place) => c.stops.some((stop) => stopReachesPlace(place, stop))).map((p) => p.name))],
    }))
    .filter((c) => c.shared.length > 0)
    .sort((a, b) => b.shared.length - a.shared.length);
}

/**
 * Tours mainly about the same planned place (two operators' Bagasbas surf
 * lessons) are one offer with choices: show the best one (by `better`) and
 * keep the rest as its choices, instead of a card each. Groups keep the order
 * of `matches`.
 */
export function groupSameOffers<T extends PackageMatch>(matches: T[], better: (a: T, b: T) => number): Array<{ main: T; same: T[] }> {
  const groups = new Map<string, T[]>();
  for (const match of matches) {
    const key = match.primary ?? [...match.matched].sort().join("|");
    groups.set(key, [...(groups.get(key) ?? []), match]);
  }
  return [...groups.values()].map((group) => {
    const [main, ...same] = [...group].sort(better);
    return { main, same };
  });
}
