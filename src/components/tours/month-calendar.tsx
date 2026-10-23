import Link from "next/link";
import type { ReactNode } from "react";
import { buildMonthGrid, formatMonthLabel, type CalendarDay, type CalendarMonth } from "@/lib/tours/events-calendar";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Sunday-first month grid. Presentational only (no hooks), so server pages and
 * client components can both use it; `renderDay` fills each in-month cell.
 */
export function MonthCalendar({
  month,
  today,
  prevHref,
  nextHref,
  renderDay,
  label,
}: {
  month: CalendarMonth;
  today: string;
  prevHref?: string;
  nextHref?: string;
  renderDay: (cell: CalendarDay, isToday: boolean) => ReactNode;
  label?: string;
}) {
  const grid = buildMonthGrid(month);
  const title = formatMonthLabel(month);
  const arrow = "grid h-11 w-11 place-items-center rounded-full border border-daet-ink/15 text-lg font-black hover:bg-daet-sand";
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        {prevHref ? (
          <Link href={prevHref} aria-label="Previous month" className={arrow} scroll={false}>
            ‹
          </Link>
        ) : (
          <span className="h-11 w-11" />
        )}
        <p className="font-black text-daet-ink">{label ? `${label} · ${title}` : title}</p>
        {nextHref ? (
          <Link href={nextHref} aria-label="Next month" className={arrow} scroll={false}>
            ›
          </Link>
        ) : (
          <span className="h-11 w-11" />
        )}
      </div>
      <div role="grid" aria-label={title}>
        <div role="row" className="grid grid-cols-7 text-center text-[11px] font-black uppercase tracking-wide text-daet-ink/50">
          {WEEKDAYS.map((d) => (
            <span role="columnheader" key={d} className="py-1">
              {d}
            </span>
          ))}
        </div>
        {grid.map((week) => (
          <div role="row" key={week[0].dateKey} className="grid grid-cols-7 gap-1 py-0.5">
            {week.map((cell) => (
              <div role="gridcell" key={cell.dateKey} className="min-w-0">
                {cell.inMonth ? renderDay(cell, cell.dateKey === today) : <span className="block h-12" aria-hidden="true" />}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
