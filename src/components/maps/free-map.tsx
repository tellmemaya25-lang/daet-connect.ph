"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
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

/** Stops on a labelled map (the itinerary): dark dots, and a white pin for the picked one. */
const STOP_DOT = "grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-slate-900 text-xs font-extrabold text-white";
const STOP_PIN = "grid h-8 w-8 place-items-center rounded-full border-2 border-slate-900 bg-white text-sm font-extrabold text-slate-900";
const LABEL_HALO = "text-slate-900 [text-shadow:0_0_2px_#fff,0_0_4px_#fff,0_0_6px_#fff] dark:text-slate-100 dark:[text-shadow:0_0_2px_#0f172a,0_0_4px_#0f172a]";

/** Names on the map stay short; the full name is in the label for screen readers. */
export const shortLabel = (text: string, max = 16) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function markerElement(m: FreeMapMarker, active: boolean, labels: boolean, onClick?: (id: string) => void): HTMLElement {
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
  el.title = m.title;
  // aria-label needs a role on a plain element; links and buttons already have one.
  if (!m.href && !onClick) el.setAttribute("role", "img");
  el.setAttribute("aria-label", m.title);

  if (!(labels && m.kind === "stop")) {
    el.className = MARKER_CLASSES[active && m.kind === "stop" ? "stopActive" : m.kind];
    el.textContent = m.label;
    return el;
  }
  // Labelled stop: the badge (a pin with a stem and a dot when picked), then its name and kind beside it.
  el.className = "relative flex flex-col items-center";
  const badge = document.createElement("span");
  badge.className = active ? STOP_PIN : STOP_DOT;
  badge.textContent = m.label;
  el.append(badge);
  if (active) {
    const stem = document.createElement("span");
    stem.className = "h-1.5 w-0.5 bg-slate-900";
    const dot = document.createElement("span");
    dot.className = "h-2 w-2 rounded-full border border-white bg-slate-900";
    el.append(stem, dot);
  }
  const label = document.createElement("span");
  label.setAttribute("aria-hidden", "true");
  label.className = `pointer-events-none absolute left-full top-0 ml-1.5 flex w-max max-w-[10rem] flex-col text-left leading-tight ${LABEL_HALO}`;
  const name = document.createElement("span");
  name.className = "text-xs font-bold";
  name.textContent = shortLabel(m.title);
  label.append(name);
  if (m.subtitle) {
    const sub = document.createElement("span");
    sub.className = "text-[11px] font-medium opacity-75";
    sub.textContent = m.subtitle;
    label.append(sub);
  }
  el.append(label);
  return el;
}

const signature = (m: FreeMapMarker, active: boolean, clickable: boolean, labels: boolean) =>
  `${m.kind}|${m.label}|${m.title}|${m.subtitle ?? ""}|${m.href ?? ""}|${active}|${clickable}|${labels}`;

/** The camera after a flight lands: a slow push in, like a drone settling. */
const DRIFT_ZOOM = 0.6;
const DRIFT_MS = 5000;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

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
 * `focusId`: fly to that marker (pulling back, gliding over, diving in, then
 * a slow drift closer) and mark it active. `labels` names stop markers on the
 * map. `onMarkerClick` makes markers buttons. `animateFit` eases reframes
 * after the first one.
 */
export function FreeMap({
  markers,
  lines = [],
  title,
  fitKey = "",
  className = "h-72 sm:h-96",
  focusId = null,
  onMarkerClick,
  labels = false,
  animateFit = false,
}: {
  markers: FreeMapMarker[];
  lines?: FreeMapLine[];
  title: string;
  fitKey?: string;
  className?: string;
  focusId?: string | null;
  onMarkerClick?: (id: string) => void;
  labels?: boolean;
  animateFit?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const libRef = useRef<MapLibre | null>(null);
  const markerRefs = useRef(new Map<string, { marker: MapLibreMarker; sig: string }>());
  const latest = useRef({ markers, lines });
  const clickRef = useRef(onMarkerClick);
  // Bumped whenever a drift should not start (or should stop): a new focus, the viewer moving the map.
  const driftToken = useRef(0);
  const firstFit = useRef(true);
  const [mode, setMode] = useState<"map" | "sketch">("map");
  const [ready, setReady] = useState(false);
  latest.current = { markers, lines };
  clickRef.current = onMarkerClick;
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
        // The viewer taking over the camera stops the drift.
        const stopDrift = () => {
          driftToken.current += 1;
        };
        map.on("dragstart", stopDrift);
        map.on("wheel", stopDrift);
        map.on("touchstart", stopDrift);
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
      const sig = signature(m, active, clickable, labels);
      const existing = markerRefs.current.get(m.id);
      if (existing && existing.sig === sig) {
        existing.marker.setLngLat([m.lng, m.lat]);
        continue;
      }
      existing?.marker.remove();
      const element = markerElement(m, active, labels, clickable ? (id) => clickRef.current?.(id) : undefined);
      // A picked, labelled stop is a pin: its tip (the bottom) sits on the spot.
      const anchor = labels && active && m.kind === "stop" ? "bottom" : "center";
      const marker = new lib.Marker({ element, anchor }).setLngLat([m.lng, m.lat]).addTo(map);
      markerRefs.current.set(m.id, { marker, sig });
    }
    for (const [id, { marker }] of markerRefs.current) {
      if (!seen.has(id)) {
        marker.remove();
        markerRefs.current.delete(id);
      }
    }
  }, [markers, ready, focusId, clickable, labels]);

  // Focus: pull back, glide over and dive in to the picked marker, then drift slowly closer.
  useEffect(() => {
    const map = mapRef.current;
    const token = ++driftToken.current;
    if (!ready || !map || !focusId) return;
    const m = latest.current.markers.find((marker) => marker.id === focusId);
    if (!m) return;
    const center: [number, number] = [m.lng, m.lat];
    if (reducedMotion()) {
      map.jumpTo({ center, zoom: 15.5 });
      return;
    }
    map.flyTo({ center, zoom: 15.5, curve: 1.9, speed: 0.9, essential: true });
    map.once("moveend", () => {
      if (driftToken.current !== token) return;
      map.easeTo({ zoom: map.getZoom() + DRIFT_ZOOM, duration: DRIFT_MS, easing: easeOutCubic, essential: true });
    });
  }, [focusId, ready]);

  // Reframe when asked.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    fit(mapRef.current, [...latest.current.markers, ...latest.current.lines.flatMap((l) => l.path)], animateFit && !firstFit.current);
    firstFit.current = false;
  }, [fitKey, ready, animateFit]);

  if (markers.length === 0 && lines.length === 0) return null;
  if (mode === "sketch") return <SketchMap markers={markers} lines={lines} title={title} focusId={focusId} pins={labels} />;

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
