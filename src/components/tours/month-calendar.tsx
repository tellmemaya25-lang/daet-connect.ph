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
  const arrow = "grid h-11 w-11 place-items-center rounded-full bg-muted text-lg font-bold hover:bg-blue-50 dark:hover:bg-blue-950/40";
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
        <p className="font-bold text-daet-ink">{label ? `${label} · ${title}` : title}</p>
        {nextHref ? (
          <Link href={nextHref} aria-label="Next month" className={arrow} scroll={false}>
            ›
          </Link>
        ) : (
          <span className="h-11 w-11" />
        )}
      </div>
      <div role="grid" aria-label={title} className="-mx-3 sm:mx-0">
        <div role="row" className="grid grid-cols-7 text-center text-sm font-semibold text-slate-600 dark:text-slate-400">
          {WEEKDAYS.map((d) => (
            <span role="columnheader" key={d} className="py-1">
              {d}
            </span>
          ))}
        </div>
        {grid.map((week) => (
          <div role="row" key={week[0].dateKey} className="grid grid-cols-7 gap-0.5 py-0.5">
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
