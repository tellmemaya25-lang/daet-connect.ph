import type { EditStop } from "../[id]/edit/edit-types";

/**
 * Stops are chosen, not typed: an attraction from `tours_attractions`, or a
 * point the operator taps on the map. These are the shared pieces — the types
 * the picker works with, and the one rule for what counts as a real
 * coordinate, used by the picker and by the server when it reads a draft back.
 */

export type CreateStop = {
  locationName: string;
  description: string;
  latitude: number;
  longitude: number;
};

/**
 * PostgREST hands numeric columns back as either numbers or strings depending on
 * the column type, so both are accepted and normalised before use.
 */
export type Attraction = {
  id: string;
  name: string;
  description: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
};

/** A usable point inside the coordinate ranges, and nothing else. */
export function validCoordinates(latitude: unknown, longitude: unknown): latitude is number {
  return (
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * The point of an attraction, as numbers — or null when it does not have a
 * usable one. Nothing is invented from a partial or odd value.
 */
export function toCoordinates(
  latitude: unknown,
  longitude: unknown,
): { latitude: number; longitude: number } | null {
  const lat = typeof latitude === "string" && latitude.trim() !== "" ? Number(latitude) : latitude;
  const lng = typeof longitude === "string" && longitude.trim() !== "" ? Number(longitude) : longitude;
  if (!validCoordinates(lat, lng)) return null;
  return { latitude: lat, longitude: lng as number };
}

/**
 * The picker works with the three fields an operator sees; the draft keeps the
 * editor's fuller stop shape. Order is the array order — one, two, three.
 */
export function toCreateStop(stop: EditStop): CreateStop {
  return {
    locationName: stop.locationName,
    description: stop.description ?? "",
    latitude: stop.latitude,
    longitude: stop.longitude,
  };
}

export function fromCreateStops(stops: CreateStop[]): EditStop[] {
  return stops.map((stop, index) => ({
    locationName: stop.locationName,
    description: stop.description.trim() === "" ? null : stop.description,
    latitude: stop.latitude,
    longitude: stop.longitude,
    estimatedDurationMinutes: null,
    stopOrder: index + 1,
  }));
}
