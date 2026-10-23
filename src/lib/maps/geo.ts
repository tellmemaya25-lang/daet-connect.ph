/**
 * Pure geography helpers for routes and maps. When the Routes API is not
 * available, distances fall back to straight-line (Haversine) distance times
 * a road factor, at an average provincial driving speed.
 */

export type LatLng = { lat: number; lng: number };
export type Leg = { distanceM: number; durationS: number; polyline: string | null; estimated: boolean };

const EARTH_RADIUS_M = 6_371_008.8;
export const ROAD_FACTOR = 1.4;
export const FALLBACK_SPEED_KMH = 30;

export function isLatLng(value: Partial<LatLng> | null | undefined): value is LatLng {
  return (
    !!value &&
    typeof value.lat === "number" && typeof value.lng === "number" &&
    Number.isFinite(value.lat) && Number.isFinite(value.lng) &&
    Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180
  );
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function estimateLeg(a: LatLng, b: LatLng): Leg {
  const distanceM = Math.round(haversineMeters(a, b) * ROAD_FACTOR);
  const durationS = Math.round(distanceM / ((FALLBACK_SPEED_KMH * 1000) / 3600));
  return { distanceM, durationS, polyline: null, estimated: true };
}

/** Cache key for a point: 5 decimals is about 1 m. */
export function coordKey(point: LatLng): string {
  return `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
}

/** Decodes a Google encoded polyline into points. */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const axis of ["lat", "lng"] as const) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === "lat") lat += delta;
      else lng += delta;
    }
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

export type RouteTotals = { distanceM: number; durationS: number; estimated: boolean };

export function routeTotals(legs: Leg[]): RouteTotals {
  return legs.reduce<RouteTotals>(
    (total, leg) => ({ distanceM: total.distanceM + leg.distanceM, durationS: total.durationS + leg.durationS, estimated: total.estimated || leg.estimated }),
    { distanceM: 0, durationS: 0, estimated: false },
  );
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** Google Maps link (no API key needed) for directions through the points. */
export function directionsUrl(points: LatLng[]): string | null {
  if (points.length === 0) return null;
  const fmt = (p: LatLng) => `${p.lat},${p.lng}`;
  if (points.length === 1) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fmt(points[0]))}`;
  const params = new URLSearchParams({ api: "1", origin: fmt(points[0]), destination: fmt(points[points.length - 1]), travelmode: "driving" });
  const middle = points.slice(1, -1).slice(0, 8);
  if (middle.length) params.set("waypoints", middle.map(fmt).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Fits points into a width×height box (equirectangular, fine at city scale) for the SVG fallback map. */
export function projectPoints(points: LatLng[], width: number, height: number, padding = 24): Array<{ x: number; y: number }> {
  if (points.length === 0) return [];
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const cos = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
  const spanX = Math.max((maxLng - minLng) * cos, 1e-6);
  const spanY = Math.max(maxLat - minLat, 1e-6);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  // An axis with no spread (one point, or points in a line) is centred.
  const flatX = (maxLng - minLng) * cos < 1e-5;
  const flatY = maxLat - minLat < 1e-5;
  return points.map((p) => ({
    x: flatX ? width / 2 : offsetX + (p.lng - minLng) * cos * scale,
    y: flatY ? height / 2 : offsetY + (maxLat - p.lat) * scale,
  }));
}
