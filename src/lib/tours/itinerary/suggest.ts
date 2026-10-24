import { haversineMeters, type LatLng } from "@/lib/maps/geo";

/** Published packages whose stops pass near the planned attractions ("Book matching tours"). */

export const MATCH_RADIUS_M = 1500;

export type PackageCandidate = { id: string; title: string; coverImageUrl: string | null; stops: Array<LatLng & { name: string }> };
export type PackageMatch = { id: string; title: string; coverImageUrl: string | null; matched: string[] };

export function matchPackages(places: Array<LatLng & { name: string }>, packages: PackageCandidate[], limit = 3): PackageMatch[] {
  return packages
    .map((pkg) => {
      const matched = places.filter((place) => pkg.stops.some((stop) => haversineMeters(place, stop) <= MATCH_RADIUS_M)).map((p) => p.name);
      return { id: pkg.id, title: pkg.title, coverImageUrl: pkg.coverImageUrl, matched: [...new Set(matched)] };
    })
    .filter((match) => match.matched.length > 0)
    .sort((a, b) => b.matched.length - a.matched.length || a.title.localeCompare(b.title))
    .slice(0, limit);
}
