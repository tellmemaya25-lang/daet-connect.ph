import { PHOTOS } from "@/lib/photo-credits";
import { haversineMeters } from "@/lib/maps/geo";
import { matchPlacePhoto } from "@/lib/tours/trip-board";

export type PackageStopRow = {
  id: string;
  location_name: string;
  description: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  stop_order: number;
};

export type AttractionRef = {
  name: string;
  slug: string;
  description: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  photo_url: string | null;
  category?: string | null;
};

export type StopDetail = {
  id: string;
  name: string;
  description: string | null;
  lat: number | null;
  lng: number | null;
  photo: { src: string; alt: string } | null;
  /** The place's own page, when the stop is a listed attraction. */
  href: string | null;
  /** The kind of place, shown under its name on the map ("Heritage site"). */
  subtitle: string | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  beach: "Beach",
  heritage: "Heritage site",
  nature: "Nature",
  food: "Food",
  adventure: "Adventure",
  shopping: "Shopping",
  religious: "Church",
  park: "Park",
};

const num = (value: number | string | null): number | null => {
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Lowercase, no accents, letters and digits only: "First José Rizal Monument" → "firstjoserizalmonument". */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * The listed attraction a stop is, by name: the same name, or one name inside
 * the other ("Daet Heritage Center" in "Daet Heritage Center and Museum").
 * Being near an attraction isn't enough (a meeting point beside the Rizal
 * monument isn't the monument); distance only picks between name matches.
 */
export function matchStopAttraction(stop: { name: string; lat: number | null; lng: number | null }, attractions: AttractionRef[]): AttractionRef | null {
  const key = normalizeName(stop.name);
  if (key.length < 4) return null;
  const matches = attractions.filter((a) => {
    const other = normalizeName(a.name);
    if (other.length < 4) return false;
    return other === key || (Math.min(other.length, key.length) >= 8 && (other.includes(key) || key.includes(other)));
  });
  if (matches.length <= 1 || stop.lat === null || stop.lng === null) return matches[0] ?? null;
  const at = { lat: stop.lat, lng: stop.lng };
  const distance = (a: AttractionRef) => {
    const lat = num(a.latitude);
    const lng = num(a.longitude);
    return lat === null || lng === null ? Infinity : haversineMeters(at, { lat, lng });
  };
  return [...matches].sort((a, b) => distance(a) - distance(b))[0];
}

/** A short line from a longer description: the first sentence, at most `max` characters. */
export function shortText(text: string | null, max = 200): string | null {
  const clean = text?.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const sentence = clean.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? clean;
  return sentence.length <= max ? sentence : `${sentence.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Stops in order, each with its map pin, a photo and a link when the stop is a
 * listed attraction. The photo is the attraction's own, else one of our
 * licensed photos of that very place; otherwise none (never another place's).
 */
export function buildStopDetails(stops: PackageStopRow[], attractions: AttractionRef[]): StopDetail[] {
  return [...stops]
    .sort((a, b) => a.stop_order - b.stop_order)
    .map((stop) => {
      const lat = num(stop.latitude);
      const lng = num(stop.longitude);
      const pinned = lat !== null && lng !== null;
      const attraction = matchStopAttraction({ name: stop.location_name, lat: pinned ? lat : null, lng: pinned ? lng : null }, attractions);
      // Our licensed photos only for a listed place (a stop named "Rizal St." is not the monument).
      const photoKey = attraction && !attraction.photo_url ? matchPlacePhoto(attraction.name) : null;
      const photo = attraction?.photo_url
        ? { src: attraction.photo_url, alt: attraction.name }
        : photoKey
          ? { src: PHOTOS[photoKey].src, alt: PHOTOS[photoKey].alt }
          : null;
      return {
        id: stop.id,
        name: stop.location_name,
        description: stop.description?.trim() || shortText(attraction?.description ?? null),
        lat: pinned ? lat : null,
        lng: pinned ? lng : null,
        photo,
        href: attraction ? `/tours/attractions/${attraction.slug}` : null,
        subtitle: (attraction?.category && CATEGORY_LABEL[attraction.category]) || null,
      };
    });
}
