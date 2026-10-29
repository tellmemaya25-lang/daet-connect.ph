import type { LatLng } from "@/lib/maps/geo";

/**
 * Google Maps links (Maps URLs, api=1), no key needed. Directions leave out
 * the origin on purpose: Google Maps then starts from the phone's own
 * location. A place without a confirmed pin is searched by name instead.
 * https://developers.google.com/maps/documentation/urls/guide
 */

export type MapsTarget = { point?: LatLng | null; name: string; area?: string | null };
export type MapsMode = "driving" | "walking" | "transit";

const MAX_URL = 2048;

/** What Google Maps should look for: the pin if there is one, else "name, area, Camarines Norte". */
export function mapsQuery(target: MapsTarget): string {
  if (target.point) return `${target.point.lat.toFixed(6)},${target.point.lng.toFixed(6)}`;
  const area = target.area?.trim() || "Daet";
  const parts = [target.name.trim(), area];
  if (!/camarines norte/i.test(area)) parts.push("Camarines Norte");
  return parts.filter(Boolean).join(", ");
}

const clip = (url: string) => (url.length > MAX_URL ? url.slice(0, MAX_URL) : url);

export function mapsDirectionsUrl(target: MapsTarget, mode: MapsMode = "driving"): string {
  const params = new URLSearchParams({ api: "1", destination: mapsQuery(target), travelmode: mode });
  return clip(`https://www.google.com/maps/dir/?${params.toString()}`);
}

export function mapsPlaceUrl(target: MapsTarget): string {
  const params = new URLSearchParams({ api: "1", query: mapsQuery(target) });
  return clip(`https://www.google.com/maps/search/?${params.toString()}`);
}
