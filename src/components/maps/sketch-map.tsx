import type { FreeMapLine, FreeMapMarker } from "@/components/maps/map-types";
import { projectPoints } from "@/lib/maps/geo";

const W = 640;
const H = 360;

/**
 * The map without tiles: markers and lines drawn to their relative
 * positions. Used when the tile map can't load (no network, weak signal,
 * no WebGL), so the page still shows where things are.
 */
export function SketchMap({ markers, lines = [], title, className = "" }: { markers: FreeMapMarker[]; lines?: FreeMapLine[]; title: string; className?: string }) {
  const all = [...markers, ...lines.flatMap((line) => line.path)];
  if (all.length === 0) return null;
  const projected = projectPoints(all, W, H, 40);
  const at = (i: number) => projected[i];
  let cursor = markers.length;
  const linePoints = lines.map((line) => {
    const pts = line.path.map(() => at(cursor++));
    return { line, points: pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") };
  });
  const labelled = markers.map((m, i) => ({ m, p: at(i) }));
  // Pins close together: put every other label under its pin so they don't overlap.
  const below = (i: number): boolean => i > 0 && Math.hypot(labelled[i].p.x - labelled[i - 1].p.x, labelled[i].p.y - labelled[i - 1].p.y) < 70 && !below(i - 1);
  const labelX = (x: number) => Math.min(W - 90, Math.max(90, x));

  return (
    <figure className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="h-auto w-full rounded-2xl bg-blue-50 dark:bg-slate-900">
        {linePoints.map(({ line, points }) => (
          <polyline key={line.id} points={points} fill="none" className="stroke-blue-600 dark:stroke-blue-400" strokeWidth="4" strokeDasharray={line.dashed ? "10 8" : undefined} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {labelled.map(({ m, p }, i) => {
          const key = `${m.id}-${i}`;
          if (m.kind === "town") {
            return (
              <g key={key}>
                <circle cx={p.x} cy={p.y} r="24" className="fill-amber-400/30 stroke-amber-500" strokeWidth="2" strokeDasharray="4 4" />
                <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" fontWeight="800" className="fill-daet-ink">
                  {m.label}
                </text>
              </g>
            );
          }
          const fill = {
            stop: "fill-blue-600",
            place: "fill-blue-600",
            guide: "fill-blue-600",
            guest: "fill-slate-900 dark:fill-slate-100",
            paused: "fill-surface",
            flare: "fill-red-600",
          }[m.kind];
          const text = m.kind === "guest" ? "fill-white dark:fill-slate-900" : m.kind === "paused" ? "fill-daet-ink" : "fill-white";
          const r = m.kind === "guide" ? 16 : 13;
          const showName = m.kind === "stop" || m.kind === "place";
          return (
            <g key={key}>
              {m.kind === "guide" || m.kind === "flare" ? <circle cx={p.x} cy={p.y} r={r + 9} className={m.kind === "guide" ? "fill-blue-600/20" : "fill-red-600/25"} /> : null}
              <circle cx={p.x} cy={p.y} r={r} className={`${fill} ${m.kind === "paused" ? "stroke-slate-500" : "stroke-surface"}`} strokeWidth="3" strokeDasharray={m.kind === "paused" ? "3 3" : undefined} />
              <text x={p.x} y={p.y + 4.5} textAnchor="middle" fontSize={m.label.length > 2 ? 9 : 12} fontWeight="800" className={text}>
                {m.label}
              </text>
              {showName ? (
                <text x={labelX(p.x)} y={below(i) ? p.y + 32 : p.y - 19} textAnchor="middle" fontSize="13" fontWeight="700" className="fill-daet-ink stroke-blue-50 dark:stroke-slate-900" strokeWidth="4" paintOrder="stroke">
                  {m.title.length > 26 ? `${m.title.slice(0, 25)}…` : m.title}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 px-1 text-sm text-daet-ink/75">Sketch map (not to road scale). North is up.</figcaption>
    </figure>
  );
}
