import { haversineMeters, isLatLng, type LatLng } from "@/lib/maps/geo";
import { toManilaDateKey } from "@/lib/tours/events-calendar";

/** "Tours happening during this event" (F11). */

export const NEARBY_METERS = 5000;
export const MAX_EVENT_TOURS = 6;

/** Manila dates an event covers, inclusive. */
export function eventDayRange(event: { starts_at: string; ends_at: string }): { from: string; to: string } {
  return { from: toManilaDateKey(event.starts_at), to: toManilaDateKey(event.ends_at) };
}

type Coord = number | string | null;
export type AvailabilityWithPackage = {
  available_date: string;
  capacity_total: number;
  capacity_booked: number;
  tours_packages: {
    id: string;
    title: string;
    location_name: string | null;
    cover_image_url: string | null;
    status?: string;
    tours_package_stops?: Array<{ latitude: Coord; longitude: Coord }> | null;
  } | null;
};

export type EventTour = {
  id: string;
  title: string;
  location_name: string | null;
  cover_image_url: string | null;
  dates: string[];
  /** Distance from the event's attraction to the package's closest stop, when both are mapped. */
  nearestMeters: number | null;
};

/**
 * Published packages with seats left on at least one day of the event (from
 * today on). Packages with a stop near the event's attraction come first, then
 * the earliest open date.
 */
export function toursDuringEvent(
  rows: AvailabilityWithPackage[],
  range: { from: string; to: string },
  today: string,
  near: LatLng | null,
  limit = MAX_EVENT_TOURS,
): EventTour[] {
  const from = range.from > today ? range.from : today;
  const byPackage = new Map<string, EventTour>();
  for (const row of rows) {
    const pkg = row.tours_packages;
    if (!pkg || (pkg.status && pkg.status !== "published")) continue;
    if (row.available_date < from || row.available_date > range.to) continue;
    if (row.capacity_total - row.capacity_booked <= 0) continue;
    let tour = byPackage.get(pkg.id);
    if (!tour) {
      tour = { id: pkg.id, title: pkg.title, location_name: pkg.location_name, cover_image_url: pkg.cover_image_url, dates: [], nearestMeters: nearestStop(pkg.tours_package_stops ?? [], near) };
      byPackage.set(pkg.id, tour);
    }
    if (!tour.dates.includes(row.available_date)) tour.dates.push(row.available_date);
  }
  const isNear = (t: EventTour) => t.nearestMeters !== null && t.nearestMeters <= NEARBY_METERS;
  return [...byPackage.values()]
    .map((t) => ({ ...t, dates: t.dates.sort() }))
    .sort((a, b) => Number(isNear(b)) - Number(isNear(a)) || (isNear(a) && isNear(b) ? a.nearestMeters! - b.nearestMeters! : 0) || a.dates[0].localeCompare(b.dates[0]) || a.title.localeCompare(b.title))
    .slice(0, limit);
}

function nearestStop(stops: Array<{ latitude: Coord; longitude: Coord }>, near: LatLng | null): number | null {
  if (!near) return null;
  let best: number | null = null;
  for (const stop of stops) {
    const point = { lat: Number(stop.latitude), lng: Number(stop.longitude) };
    if (stop.latitude === null || stop.longitude === null || !isLatLng(point)) continue;
    const d = haversineMeters(near, point);
    if (best === null || d < best) best = d;
  }
  return best === null ? null : Math.round(best);
}
