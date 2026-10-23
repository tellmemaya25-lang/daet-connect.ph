import { coordKey, estimateLeg, type LatLng, type Leg } from "@/lib/maps/geo";

/**
 * Works out each leg of a multi-stop route: cached Routes API result first,
 * then a live API call, then the Haversine estimate. Free of Supabase and
 * fetch so it can be unit-tested; routes.ts wires in the real pieces.
 */

export type TravelMode = "drive" | "walk";
export const CACHE_MAX_AGE_DAYS = 30;

export type CachedLeg = { distance_m: number; duration_s: number; polyline: string | null; fetched_at: string };

export type LegDeps = {
  readCache(keys: Array<{ origin: string; dest: string }>, mode: TravelMode): Promise<Map<string, CachedLeg>>;
  writeCache(rows: Array<{ origin: string; dest: string; leg: Leg }>, mode: TravelMode): Promise<void>;
  /** Null when the API is not configured or the call fails. */
  fetchLeg(origin: LatLng, dest: LatLng, mode: TravelMode): Promise<Leg | null>;
  now?: () => Date;
};

const pairKey = (origin: string, dest: string) => `${origin}|${dest}`;

export async function computeLegs(points: LatLng[], mode: TravelMode, deps: LegDeps): Promise<Leg[]> {
  if (points.length < 2) return [];
  const pairs = points.slice(1).map((dest, i) => ({ originPoint: points[i], destPoint: dest, origin: coordKey(points[i]), dest: coordKey(dest) }));
  const now = (deps.now ?? (() => new Date()))();
  const fresh = (leg: CachedLeg) => now.getTime() - new Date(leg.fetched_at).getTime() < CACHE_MAX_AGE_DAYS * 86400 * 1000;

  let cache = new Map<string, CachedLeg>();
  try {
    cache = await deps.readCache(pairs, mode);
  } catch {
    // A cache outage only costs API calls.
  }

  const fetched: Array<{ origin: string; dest: string; leg: Leg }> = [];
  const legs = await Promise.all(
    pairs.map(async (pair): Promise<Leg> => {
      if (pair.origin === pair.dest) return { distanceM: 0, durationS: 0, polyline: null, estimated: false };
      const hit = cache.get(pairKey(pair.origin, pair.dest));
      if (hit && fresh(hit)) return { distanceM: hit.distance_m, durationS: hit.duration_s, polyline: hit.polyline, estimated: false };
      const live = await deps.fetchLeg(pair.originPoint, pair.destPoint, mode).catch(() => null);
      if (live) {
        fetched.push({ origin: pair.origin, dest: pair.dest, leg: live });
        return live;
      }
      // Use an old cached value before guessing.
      if (hit) return { distanceM: hit.distance_m, durationS: hit.duration_s, polyline: hit.polyline, estimated: false };
      return estimateLeg(pair.originPoint, pair.destPoint);
    }),
  );

  if (fetched.length) await deps.writeCache(fetched, mode).catch(() => undefined);
  return legs;
}

export { pairKey };

/** Routes API duration strings look like "1234s". */
export function parseDurationSeconds(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value);
  return match ? Math.round(Number(match[1])) : null;
}
