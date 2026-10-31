import type { LatLng } from "@/lib/maps/geo";
import { BEACH_ROAD, BUS_ROUTE, COAST, PLACES, STOPS } from "@/lib/tours/live-tracking-sim";

export type MapMarker = {
  id: string;
  label: string;
  position: LatLng;
  kind: "guide" | "guest" | "town" | "paused" | "flare";
};

const W = 640;
const H = 440;
const PAD = 40;

const BOUNDS = {
  region: { minLat: 13.85, maxLat: 14.6, minLng: 120.9, maxLng: 123.05 },
  town: { minLat: 14.103, maxLat: 14.142, minLng: 122.94, maxLng: 122.998 },
  center: { minLat: 14.1045, maxLat: 14.1175, minLng: 122.9435, maxLng: 122.9615 },
  beach: { minLat: 14.1255, maxLat: 14.137, minLng: 122.977, maxLng: 122.994 },
};

export type MapScale = keyof typeof BOUNDS;

/** Equirectangular fit, good enough for a sketch this size. */
function projector(scale: keyof typeof BOUNDS) {
  const b = BOUNDS[scale];
  const kx = Math.cos((((b.minLat + b.maxLat) / 2) * Math.PI) / 180);
  const spanX = (b.maxLng - b.minLng) * kx;
  const spanY = b.maxLat - b.minLat;
  const s = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY);
  const offX = (W - spanX * s) / 2;
  const offY = (H - spanY * s) / 2;
  return (p: LatLng) => ({ x: offX + (p.lng - b.minLng) * kx * s, y: offY + (b.maxLat - p.lat) * s });
}

const points = (path: LatLng[], project: ReturnType<typeof projector>) =>
  path
    .map(project)
    .map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");

/**
 * A drawn map for the mockup: the bus route across southern Luzon, or Daet
 * town and Bagasbas. Not to scale, and labelled as a sketch.
 */
export function SketchMap({ scale, markers, activeStop, title }: { scale: MapScale; markers: MapMarker[]; activeStop: number; title: string }) {
  const project = projector(scale);
  const sea = [{ lat: 14.1425, lng: 122.92 }, ...COAST, { lat: 14.125, lng: 123.02 }, { lat: 14.16, lng: 123.02 }, { lat: 14.16, lng: 122.92 }];

  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="h-auto w-full rounded-2xl bg-blue-50 dark:bg-slate-900">
        {scale === "region" ? (
          <g>
            <polyline points={points(BUS_ROUTE, project)} fill="none" className="stroke-blue-600 dark:stroke-blue-400" strokeWidth="4" strokeDasharray="10 8" strokeLinecap="round" />
            {BUS_ROUTE.map((town, i) => {
              const { x, y } = project(town);
              const end = i === 0 || i === BUS_ROUTE.length - 1;
              return (
                <g key={town.name}>
                  <circle cx={x} cy={y} r={end ? 9 : 6} className="fill-surface stroke-blue-600 dark:stroke-blue-400" strokeWidth="3" />
                  <text x={x} y={y + (i % 2 ? 34 : -18)} textAnchor="middle" fontSize={end ? 24 : 20} fontWeight={end ? 800 : 600} className="fill-daet-ink stroke-blue-50 dark:stroke-slate-900" strokeWidth="4" paintOrder="stroke">
                    {town.name}
                  </text>
                </g>
              );
            })}
          </g>
        ) : (
          <g>
            <polygon points={points(sea, project)} className="fill-sky-200 dark:fill-sky-950" />
            <text {...project({ lat: 14.1445, lng: 122.952 })} fontSize="20" fontWeight="700" className="fill-sky-800 dark:fill-sky-300">
              Philippine Sea
            </text>
            <polyline points={points(BEACH_ROAD, project)} fill="none" className="stroke-muted-strong" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points={points([PLACES.busStop, PLACES.rizalPark], project)} fill="none" className="stroke-muted-strong" strokeWidth="10" strokeLinecap="round" />
            {STOPS.map((stop, i) => {
              const { x, y } = project(stop.place);
              const done = i < activeStop;
              const current = i === activeStop;
              // The first two stops are 30 m apart; put one label on each side.
              const dy = i === 1 ? 40 : -28;
              return (
                <g key={stop.id}>
                  <circle cx={x} cy={y} r="16" className={current ? "fill-blue-600" : done ? "fill-green-500" : "fill-surface stroke-line"} strokeWidth="2" />
                  <text x={x} y={y + 6} textAnchor="middle" fontSize="16" fontWeight="800" className={current ? "fill-white" : done ? "fill-slate-950" : "fill-daet-ink"}>
                    {i + 1}
                  </text>
                  <text x={Math.min(W - 170, Math.max(170, x))} y={y + dy} textAnchor="middle" fontSize="20" fontWeight="700" className="fill-daet-ink stroke-blue-50 dark:stroke-slate-900" strokeWidth="4" paintOrder="stroke">
                    {stop.name.replace(/, lunch.*$/, "").replace(" and Museum", "")}
                  </text>
                </g>
              );
            })}
            <g>
              {(() => {
                const { x, y } = project(PLACES.busStop);
                return (
                  <>
                    <rect x={x - 9} y={y - 9} width="18" height="18" rx="3" className="fill-surface stroke-line" strokeWidth="2" />
                    <text x={x} y={y + 32} textAnchor="middle" fontSize="18" fontWeight="600" className="fill-daet-ink stroke-blue-50 dark:stroke-slate-900" strokeWidth="4" paintOrder="stroke">
                      Bus drop-off
                    </text>
                  </>
                );
              })()}
            </g>
          </g>
        )}

        {markers.map((m) => {
          const { x, y } = project(m.position);
          if (m.kind === "town") {
            return (
              <g key={m.id}>
                <circle cx={x} cy={y} r="34" className="fill-amber-400/30 stroke-amber-500" strokeWidth="2" strokeDasharray="4 4" />
                <circle cx={x} cy={y} r="18" className="fill-amber-500" />
                <text x={x} y={y + 5.5} textAnchor="middle" fontSize="15" fontWeight="800" className="fill-slate-950">
                  {m.label}
                </text>
              </g>
            );
          }
          if (m.kind === "flare") {
            return (
              <g key={m.id}>
                <circle cx={x} cy={y} r="30" className="fill-red-600/25 animate-ping [transform-box:fill-box] [transform-origin:center] motion-reduce:animate-none" />
                <path d={`M${x} ${y} l-15 -24 a17 17 0 1 1 30 0 z`} className="fill-red-600 stroke-surface" strokeWidth="2" />
                <text x={x} y={y - 29} textAnchor="middle" fontSize="16" fontWeight="800" className="fill-white">
                  {m.label}
                </text>
              </g>
            );
          }
          if (m.kind === "guide") {
            return (
              <g key={m.id}>
                <circle cx={x} cy={y} r="32" className="fill-blue-600/20 animate-pulse motion-reduce:animate-none" />
                <circle cx={x} cy={y} r="21" className="fill-blue-600 stroke-surface" strokeWidth="3" />
                <text x={x} y={y + 5.5} textAnchor="middle" fontSize="15" fontWeight="800" className="fill-white">
                  {m.label}
                </text>
              </g>
            );
          }
          const paused = m.kind === "paused";
          return (
            <g key={m.id} opacity={paused ? 0.75 : 1}>
              <circle cx={x} cy={y} r="17" className={paused ? "fill-surface stroke-slate-500" : "fill-slate-900 dark:fill-slate-100 stroke-surface"} strokeWidth="2.5" strokeDasharray={paused ? "3 3" : undefined} />
              <text x={x} y={y + 5} textAnchor="middle" fontSize="13" fontWeight="800" className={paused ? "fill-daet-ink" : "fill-white dark:fill-slate-900"}>
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 px-1 text-xs text-daet-ink/70">Sketch map for the mockup, not to scale. North is up.</figcaption>
    </figure>
  );
}
