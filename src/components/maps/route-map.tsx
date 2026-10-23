"use client";

import { useEffect, useRef, useState } from "react";
import { decodePolyline, projectPoints, type LatLng } from "@/lib/maps/geo";

export type MapPoint = LatLng & { label: string; href?: string };

const BROWSER_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? "";

/* Minimal typing for the parts of the Maps JavaScript API used here. */
type GoogleMaps = {
  maps: {
    Map: new (el: HTMLElement, options: Record<string, unknown>) => { fitBounds(bounds: unknown, padding?: number): void; setCenter(p: LatLng): void; setZoom(z: number): void };
    Marker: new (options: Record<string, unknown>) => { addListener(event: string, fn: () => void): void };
    Polyline: new (options: Record<string, unknown>) => unknown;
    LatLngBounds: new () => { extend(p: LatLng): void };
  };
};

let loader: Promise<GoogleMaps> | null = null;
function loadGoogleMaps(): Promise<GoogleMaps> {
  const w = window as unknown as { google?: GoogleMaps; __connectDaetMapsReady?: () => void };
  if (w.google?.maps) return Promise.resolve(w.google);
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      w.__connectDaetMapsReady = () => (w.google ? resolve(w.google) : reject(new Error("Maps failed to load")));
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(BROWSER_KEY)}&callback=__connectDaetMapsReady&loading=async&v=weekly`;
      script.async = true;
      script.onerror = () => {
        loader = null;
        reject(new Error("Maps failed to load"));
      };
      document.head.appendChild(script);
    });
  }
  return loader;
}

/**
 * Markers (numbered when `connect`) and the route between them. With a
 * browser key it uses Google Maps; otherwise, or if Maps fails to load, it
 * draws a simple SVG sketch so the page still shows the layout.
 */
export function RouteMap({
  points,
  polylines = [],
  connect = false,
  className = "",
  title,
}: {
  points: MapPoint[];
  polylines?: Array<string | null>;
  connect?: boolean;
  className?: string;
  title: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"google" | "sketch">(BROWSER_KEY ? "google" : "sketch");

  useEffect(() => {
    if (mode !== "google" || !ref.current || points.length === 0) return;
    let cancelled = false;
    loadGoogleMaps()
      .then((google) => {
        if (cancelled || !ref.current) return;
        const map = new google.maps.Map(ref.current, { mapTypeControl: false, streetViewControl: false, fullscreenControl: true, gestureHandling: "cooperative" });
        const bounds = new google.maps.LatLngBounds();
        points.forEach((point, index) => {
          bounds.extend(point);
          const marker = new google.maps.Marker({ position: point, map, title: point.label, label: connect ? String(index + 1) : undefined });
          if (point.href) marker.addListener("click", () => window.location.assign(point.href!));
        });
        if (connect) {
          points.slice(1).forEach((dest, i) => {
            const encoded = polylines[i];
            const path = encoded ? decodePolyline(encoded) : [points[i], dest];
            new google.maps.Polyline({ path, map, strokeColor: "#2f5d50", strokeOpacity: encoded ? 0.9 : 0.6, strokeWeight: 4, geodesic: !encoded });
          });
        }
        if (points.length === 1) {
          map.setCenter(points[0]);
          map.setZoom(15);
        } else {
          map.fitBounds(bounds, 48);
        }
      })
      .catch(() => !cancelled && setMode("sketch"));
    return () => {
      cancelled = true;
    };
  }, [mode, points, polylines, connect]);

  if (points.length === 0) return null;

  if (mode === "google") {
    return <div ref={ref} role="img" aria-label={title} className={`h-72 w-full overflow-hidden rounded-2xl bg-daet-sand/50 sm:h-96 ${className}`} />;
  }

  const width = 640;
  const height = 360;
  const projected = projectPoints(points, width, height, 36);
  return (
    <figure className={className}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} className="h-auto w-full rounded-2xl border border-daet-ink/10 bg-[#eef4f1]">
        <defs>
          <pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#d7e3dd" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#map-grid)" />
        {connect && projected.length > 1 ? (
          <polyline points={projected.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#2f5d50" strokeWidth="4" strokeDasharray="10 8" strokeLinecap="round" />
        ) : null}
        {projected.map((p, index) => (
          <g key={`${points[index].label}-${index}`}>
            <circle cx={p.x} cy={p.y} r="13" fill="#2f5d50" stroke="#fff" strokeWidth="3" />
            <text x={p.x} y={p.y + 4.5} textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">
              {connect ? index + 1 : "•"}
            </text>
            <text x={p.x} y={p.y - 19} textAnchor="middle" fontSize="13" fontWeight="700" fill="#172b24" stroke="#eef4f1" strokeWidth="4" paintOrder="stroke">
              {points[index].label.length > 26 ? `${points[index].label.slice(0, 25)}…` : points[index].label}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="mt-1 text-xs text-daet-ink/55">Sketch map (not to road scale). North is up.</figcaption>
    </figure>
  );
}
