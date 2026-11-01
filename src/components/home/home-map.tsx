"use client";

import { FreeMap } from "@/components/maps/free-map";
import type { FreeMapMarker } from "@/components/maps/map-types";

export type MapPlace = { slug: string; name: string; lat: number; lng: number; subtitle?: string };

/**
 * All six places on one map. A pin opens that place in the fan at the top of
 * the page: the fan already treats the URL hash as the truth, so all this does
 * is set it and take the visitor back up to see it.
 */
export function HomeMap({ places }: { places: MapPlace[] }) {
  const markers: FreeMapMarker[] = places.map((place) => ({
    id: place.slug,
    kind: "place",
    label: place.name.slice(0, 1),
    title: place.name,
    subtitle: place.subtitle,
    lat: place.lat,
    lng: place.lng,
  }));

  const openInFan = (slug: string) => {
    window.location.hash = `#place-${slug}`;
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <FreeMap
      markers={markers}
      title="Map of the places in Daet and around it"
      fitKey={places.map((place) => `${place.slug}:${place.lat},${place.lng}`).join("|")}
      onMarkerClick={openInFan}
      labels
      className="h-80 overflow-hidden rounded-2xl sm:h-96"
    />
  );
}
