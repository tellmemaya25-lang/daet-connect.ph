/**
 * Free map tiles: OpenFreeMap (OpenStreetMap data, no key, no request
 * limits). Change the provider here only. If a style can't load, FreeMap
 * tries the light style, then falls back to the sketch map.
 */
export const MAP_STYLES = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
} as const;

/** Shown in the map corner; the OpenFreeMap styles carry the same credit in their sources. */
export const MAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>';

/** Give up on tiles and draw the sketch if the style hasn't loaded by then. */
export const MAP_LOAD_TIMEOUT_MS = 10_000;

/** MapLibre's worker, copied to public/ by scripts/copy-maplibre-worker.mjs. */
export const workerUrl = (version: string) => `/vendor/maplibre-gl-worker-${version}.mjs`;
