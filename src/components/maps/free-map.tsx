"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker, Popup as MapLibrePopup } from "maplibre-gl";
import { MARKER_CLASSES, type FreeMapLine, type FreeMapMarker } from "@/components/maps/map-types";
import { SketchMap } from "@/components/maps/sketch-map";
import type { LatLng } from "@/lib/maps/geo";
import { MAP_ATTRIBUTION, MAP_LOAD_TIMEOUT_MS, MAP_STYLES, workerUrl } from "@/lib/maps/map-style";

type MapLibre = typeof import("maplibre-gl");

const LINE_SOURCE = "free-map-lines";

/** Dark when the page is dark: an explicit choice, else the device setting (src/lib/theme.ts). */
function pageIsDark(): boolean {
  const choice = document.documentElement.getAttribute("data-theme");
  if (choice) return choice === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function lineData(lines: FreeMapLine[]) {
  return {
    type: "FeatureCollection" as const,
    features: lines
      .filter((line) => line.path.length > 1)
      .map((line) => ({
        type: "Feature" as const,
        properties: { id: line.id, dashed: Boolean(line.dashed) },
        geometry: { type: "LineString" as const, coordinates: line.path.map((p) => [p.lng, p.lat]) },
      })),
  };
}

function addLineLayers(map: MapLibreMap, lines: FreeMapLine[]) {
  if (map.getSource(LINE_SOURCE)) return;
  map.addSource(LINE_SOURCE, { type: "geojson", data: lineData(lines) });
  const paint = { "line-color": "#2563eb", "line-width": 4, "line-opacity": 0.85 };
  map.addLayer({ id: `${LINE_SOURCE}-solid`, type: "line", source: LINE_SOURCE, filter: ["==", ["get", "dashed"], false], layout: { "line-cap": "round", "line-join": "round" }, paint });
  map.addLayer({ id: `${LINE_SOURCE}-dashed`, type: "line", source: LINE_SOURCE, filter: ["==", ["get", "dashed"], true], layout: { "line-cap": "round" }, paint: { ...paint, "line-dasharray": [2, 1.5] } });
}

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

function markerElement(m: FreeMapMarker, active: boolean, onClick?: (id: string) => void): HTMLElement {
  // With a click handler the marker is a button that picks the stop; otherwise a link or a picture.
  const el = document.createElement(onClick ? "button" : m.href ? "a" : "div");
  if (onClick) {
    (el as HTMLButtonElement).type = "button";
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick(m.id);
    });
    if (active) el.setAttribute("aria-current", "true");
  } else if (m.href) (el as HTMLAnchorElement).href = m.href;
  el.className = MARKER_CLASSES[active && m.kind === "stop" ? "stopActive" : m.kind];
  el.textContent = m.label;
  el.title = m.title;
  // aria-label needs a role on a plain element; links and buttons already have one.
  if (!m.href && !onClick) el.setAttribute("role", "img");
  el.setAttribute("aria-label", m.title);
  return el;
}

const signature = (m: FreeMapMarker, active: boolean, clickable: boolean) => `${m.kind}|${m.label}|${m.title}|${m.href ?? ""}|${active}|${clickable}`;

/** The popup over a focused marker. Text only (textContent): operators write these strings. */
function popupContent(m: FreeMapMarker): HTMLElement {
  const box = document.createElement("div");
  box.className = "w-60";
  if (m.detail?.photo) {
    const img = document.createElement("img");
    img.src = m.detail.photo.src;
    img.alt = m.detail.photo.alt;
    img.className = "h-28 w-full object-cover";
    box.append(img);
  }
  const body = document.createElement("div");
  body.className = "p-3";
  const name = document.createElement("p");
  name.className = "font-bold text-daet-ink";
  name.textContent = m.title;
  body.append(name);
  if (m.detail?.text) {
    const text = document.createElement("p");
    text.className = "mt-1 line-clamp-3 text-sm text-daet-ink/80";
    text.textContent = m.detail.text;
    body.append(text);
  }
  box.append(body);
  return box;
}

function fit(map: MapLibreMap, points: LatLng[], animate = false) {
  if (points.length === 0) return;
  const duration = animate && !reducedMotion() ? 800 : 0;
  if (points.length === 1) {
    map.easeTo({ center: [points[0].lng, points[0].lat], zoom: 15, duration });
    return;
  }
  const lngs = points.map((p) => p.lng);
  const lats = points.map((p) => p.lat);
  map.fitBounds(
    [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
    { padding: 56, maxZoom: 16, duration },
  );
}

/**
 * Map on free OpenStreetMap tiles (MapLibre + OpenFreeMap, no key). Markers
 * move in place when their positions change. Follows the light/dark theme.
 * If tiles or WebGL aren't available it draws the sketch map instead.
 *
 * `fitKey`: the map frames all markers and lines on load and again whenever
 * this value changes; otherwise it stays where the viewer left it.
 *
 * `focusId`: fly to that marker, mark it active and open its popup (`detail`).
 * `onMarkerClick` makes markers buttons; `onFocusClear` runs when the viewer
 * closes the popup. `animateFit` eases reframes after the first one.
 */
export function FreeMap({
  markers,
  lines = [],
  title,
  fitKey = "",
  className = "h-72 sm:h-96",
  focusId = null,
  onMarkerClick,
  onFocusClear,
  animateFit = false,
}: {
  markers: FreeMapMarker[];
  lines?: FreeMapLine[];
  title: string;
  fitKey?: string;
  className?: string;
  focusId?: string | null;
  onMarkerClick?: (id: string) => void;
  onFocusClear?: () => void;
  animateFit?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const libRef = useRef<MapLibre | null>(null);
  const markerRefs = useRef(new Map<string, { marker: MapLibreMarker; sig: string }>());
  const latest = useRef({ markers, lines });
  const popupRef = useRef<MapLibrePopup | null>(null);
  const clickRef = useRef(onMarkerClick);
  const clearRef = useRef(onFocusClear);
  const firstFit = useRef(true);
  const [mode, setMode] = useState<"map" | "sketch">("map");
  const [ready, setReady] = useState(false);
  latest.current = { markers, lines };
  clickRef.current = onMarkerClick;
  clearRef.current = onFocusClear;
  const clickable = Boolean(onMarkerClick);

  // Create the map once.
  useEffect(() => {
    if (mode !== "map" || !container.current) return;
    let cancelled = false;
    let map: MapLibreMap | null = null;
    let timer = 0;
    const markersMap = markerRefs.current;
    const giveUp = () => {
      if (cancelled) return;
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      setReady(false);
      setMode("sketch");
    };

    import("maplibre-gl")
      .then((lib) => {
        if (cancelled || !container.current) return;
        libRef.current = lib;
        lib.setWorkerUrl(workerUrl(lib.getVersion()));
        let dark = pageIsDark();
        let triedLight = !dark;
        let loaded = false;
        try {
          map = new lib.Map({
            container: container.current,
            style: dark ? MAP_STYLES.dark : MAP_STYLES.light,
            attributionControl: { compact: true, customAttribution: MAP_ATTRIBUTION },
            cooperativeGestures: true,
            center: [122.955, 14.112],
            zoom: 12,
          });
        } catch {
          giveUp();
          return;
        }
        mapRef.current = map;
        map.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
        timer = window.setTimeout(() => !loaded && giveUp(), MAP_LOAD_TIMEOUT_MS);

        map.on("error", () => {
          if (loaded) return; // A missing tile later on is fine; the rest of the map still shows.
          if (!triedLight) {
            triedLight = true;
            map?.setStyle(MAP_STYLES.light);
            return;
          }
          giveUp();
        });
        // Runs for the first style and after every theme switch.
        map.on("style.load", () => {
          if (!map) return;
          addLineLayers(map, latest.current.lines);
          if (!loaded) {
            loaded = true;
            window.clearTimeout(timer);
            fit(map, [...latest.current.markers, ...latest.current.lines.flatMap((l) => l.path)]);
            setReady(true);
          }
        });

        const onTheme = () => {
          const next = pageIsDark();
          if (next === dark || !map) return;
          dark = next;
          map.setStyle(dark ? MAP_STYLES.dark : MAP_STYLES.light);
        };
        const observer = new MutationObserver(onTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        media.addEventListener("change", onTheme);
        map.once("remove", () => {
          observer.disconnect();
          media.removeEventListener("change", onTheme);
        });
      })
      .catch(giveUp);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      markersMap.forEach(({ marker }) => marker.remove());
      markersMap.clear();
      popupRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
  }, [mode]);

  // Markers: add, move, restyle or remove.
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!ready || !map || !lib) return;
    const seen = new Set<string>();
    for (const m of markers) {
      seen.add(m.id);
      const active = m.id === focusId;
      const sig = signature(m, active, clickable);
      const existing = markerRefs.current.get(m.id);
      if (existing && existing.sig === sig) {
        existing.marker.setLngLat([m.lng, m.lat]);
        continue;
      }
      existing?.marker.remove();
      const element = markerElement(m, active, clickable ? (id) => clickRef.current?.(id) : undefined);
      const marker = new lib.Marker({ element }).setLngLat([m.lng, m.lat]).addTo(map);
      markerRefs.current.set(m.id, { marker, sig });
    }
    for (const [id, { marker }] of markerRefs.current) {
      if (!seen.has(id)) {
        marker.remove();
        markerRefs.current.delete(id);
      }
    }
  }, [markers, ready, focusId, clickable]);

  // Focus: fly to the picked marker and open its popup.
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    const previous = popupRef.current;
    popupRef.current = null;
    previous?.remove(); // Not a viewer close: the ref is already cleared, so onFocusClear doesn't run.
    if (!ready || !map || !lib || !focusId) return;
    const m = latest.current.markers.find((marker) => marker.id === focusId);
    if (!m) return;
    const camera = { center: [m.lng, m.lat] as [number, number], zoom: Math.max(map.getZoom(), 15) };
    if (reducedMotion()) map.jumpTo(camera);
    else map.flyTo({ ...camera, speed: 1.2, curve: 1.42, essential: true });
    const popup = new lib.Popup({ offset: 26, maxWidth: "none", className: "free-map-popup", focusAfterOpen: false })
      .setLngLat([m.lng, m.lat])
      .setDOMContent(popupContent(m))
      .addTo(map);
    popup.on("close", () => {
      if (popupRef.current !== popup) return;
      popupRef.current = null;
      clearRef.current?.();
    });
    popupRef.current = popup;
  }, [focusId, ready]);

  // Lines.
  useEffect(() => {
    const source = ready ? mapRef.current?.getSource(LINE_SOURCE) : undefined;
    if (source && "setData" in source) (source as { setData: (d: unknown) => void }).setData(lineData(lines));
  }, [lines, ready]);

  // Reframe when asked.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    fit(mapRef.current, [...latest.current.markers, ...latest.current.lines.flatMap((l) => l.path)], animateFit && !firstFit.current);
    firstFit.current = false;
  }, [fitKey, ready, animateFit]);

  if (markers.length === 0 && lines.length === 0) return null;
  if (mode === "sketch") return <SketchMap markers={markers} lines={lines} title={title} focusId={focusId} />;

  return (
    <figure>
      <div ref={container} role="region" aria-label={title} className={`w-full overflow-hidden rounded-2xl bg-muted ${className}`} />
      <ul className="sr-only">
        {markers.map((m) => (
          <li key={m.id}>{m.title}</li>
        ))}
      </ul>
    </figure>
  );
}
