import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { isLatLng, routeTotals, type LatLng, type Leg } from "@/lib/maps/geo";
import { computeLegs, pairKey, parseDurationSeconds, type CachedLeg, type TravelMode } from "@/lib/maps/route-legs";

/**
 * Google Routes API (computeRoutes) per leg, cached in tours_route_cache.
 * Needs GOOGLE_MAPS_SERVER_KEY (restricted to the Routes API); without it,
 * or when a call fails, legs use the Haversine × 1.4 estimate.
 */

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const FIELD_MASK = "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline";

async function fetchLeg(origin: LatLng, dest: LatLng, mode: TravelMode): Promise<Leg | null> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY?.trim();
  if (!key) return null;
  const waypoint = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  const response = await fetch(ROUTES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK },
    body: JSON.stringify({ origin: waypoint(origin), destination: waypoint(dest), travelMode: mode === "walk" ? "WALK" : "DRIVE", languageCode: "en-PH", units: "METRIC" }),
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!response.ok) {
    console.error("Routes API error:", response.status, await response.text().catch(() => ""));
    return null;
  }
  const route = ((await response.json()) as { routes?: Array<{ distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }> }).routes?.[0];
  const durationS = parseDurationSeconds(route?.duration);
  if (!route || typeof route.distanceMeters !== "number" || durationS === null) return null;
  return { distanceM: route.distanceMeters, durationS, polyline: route.polyline?.encodedPolyline ?? null, estimated: false };
}

export type RouteSummary = { legs: Leg[]; distanceM: number; durationS: number; estimated: boolean };

export async function planRoute(points: LatLng[], mode: TravelMode = "drive"): Promise<RouteSummary> {
  const valid = points.filter(isLatLng);
  const admin = isSupabaseAdminConfigured() ? createSupabaseAdminClient() : null;

  const legs = await computeLegs(valid, mode, {
    fetchLeg,
    async readCache(keys, travelMode) {
      if (!admin || keys.length === 0) return new Map();
      const { data } = await admin
        .from("tours_route_cache")
        .select("origin_key, dest_key, distance_m, duration_s, polyline, fetched_at")
        .eq("mode", travelMode)
        .in("origin_key", [...new Set(keys.map((k) => k.origin))])
        .in("dest_key", [...new Set(keys.map((k) => k.dest))]);
      const map = new Map<string, CachedLeg>();
      for (const row of data ?? []) map.set(pairKey(row.origin_key, row.dest_key), row);
      return map;
    },
    async writeCache(rows, travelMode) {
      if (!admin) return;
      await admin.from("tours_route_cache").upsert(
        rows.map(({ origin, dest, leg }) => ({
          origin_key: origin, dest_key: dest, mode: travelMode,
          distance_m: leg.distanceM, duration_s: leg.durationS, polyline: leg.polyline, fetched_at: new Date().toISOString(),
        })),
        { onConflict: "origin_key,dest_key,mode" },
      );
    },
  });
  return { legs, ...routeTotals(legs) };
}
