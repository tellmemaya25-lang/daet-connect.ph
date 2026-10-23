"use client";

import { useState } from "react";

export type ColumnPoint = { key: string; label: string; value: number };

const niceMax = (max: number) => {
  if (max <= 4) return Math.max(1, max);
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].find((s) => (s * pow) * 4 >= max) ?? 10;
  return step * pow * 4;
};
const compact = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}K` : String(n));

/**
 * Single-series column chart (one hue, thin columns with rounded tops, hairline grid).
 * Hover or focus a day for its value; the same numbers are in the table below.
 */
export function ColumnChart({ points, unit, title }: { points: ColumnPoint[]; unit: string; title: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const ticks = [0, max / 2, max];
  const total = points.reduce((s, p) => s + p.value, 0);
  const peak = points.reduce((best, p, i) => (p.value > (points[best]?.value ?? -1) ? i : best), 0);
  const labelEvery = Math.ceil(points.length / 8);
  const shown = active ?? (total > 0 ? peak : null);

  return (
    <figure>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <figcaption className="text-sm font-bold text-daet-ink">{title}</figcaption>
        <p className="text-xs text-daet-ink/60" aria-live="polite">
          {shown !== null ? (
            <>
              <span className="font-bold text-daet-ink">{points[shown].label}</span> · {points[shown].value} {unit}
              {active === null ? " (busiest)" : ""}
            </>
          ) : (
            `No ${unit} yet`
          )}
        </p>
      </div>
      <div className="flex h-44 gap-2">
        <div className="flex flex-col justify-between pb-5 text-right text-[10px] text-daet-ink/50" aria-hidden="true">
          {[...ticks].reverse().map((t) => (
            <span key={t}>{compact(t)}</span>
          ))}
        </div>
        <div className="relative flex-1">
          <div className="absolute inset-x-0 bottom-5 top-0 flex flex-col justify-between" aria-hidden="true">
            {ticks.map((t) => (
              <div key={t} className="border-t border-daet-ink/10" />
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-5 top-0 flex items-end gap-[2px]" onMouseLeave={() => setActive(null)}>
            {points.map((p, i) => (
              <button
                key={p.key}
                type="button"
                className="group flex h-full min-w-0 flex-1 items-end justify-center focus:outline-none"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                aria-label={`${p.label}: ${p.value} ${unit}`}
              >
                <span
                  className={`block w-full max-w-6 rounded-t transition ${p.value > 0 ? "bg-daet-forest" : ""} ${active === i ? "opacity-100 ring-2 ring-daet-forest/30" : active === null ? "" : "opacity-60"}`}
                  style={{ height: `${(p.value / max) * 100}%`, minHeight: p.value > 0 ? 2 : 0 }}
                />
              </button>
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 flex h-5 items-end gap-[2px] text-[10px] text-daet-ink/50" aria-hidden="true">
            {points.map((p, i) => (
              <span key={p.key} className="flex-1 overflow-visible whitespace-nowrap text-center">
                {i % labelEvery === 0 ? p.label.replace(/^\w+, /, "") : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-xs font-bold text-daet-forest">Show as table</summary>
        <table className="mt-2 w-full text-left text-xs">
          <thead>
            <tr className="text-daet-ink/55">
              <th className="py-1 font-bold">Day</th>
              <th className="py-1 text-right font-bold">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {points.filter((p) => p.value > 0).map((p) => (
              <tr key={p.key} className="border-t border-daet-ink/10">
                <td className="py-1">{p.label}</td>
                <td className="py-1 text-right font-bold">{p.value}</td>
              </tr>
            ))}
            {total === 0 ? (
              <tr>
                <td colSpan={2} className="py-1 text-daet-ink/55">
                  None in this range.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
