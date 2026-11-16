"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MonthCalendar } from "@/components/tours/month-calendar";
import { Notice } from "@/components/ui/notice";
import { markDay, type AvailabilityState } from "@/lib/tours/dashboards";
import { formatDayHeading, type CalendarMonth } from "@/lib/tours/events-calendar";
import { Button } from "@/components/ui/button";
import { LineIcon } from "@/components/ui/icons";
import { Field, Input } from "@/components/ui/field";
import { hoursText, shortHours, toHHMM, type DayAvailability } from "@/lib/tours/guide-hours";
import { markWeekendsAvailable, setGuideAvailability, setGuideHours } from "./availability-actions";

const STYLE: Record<AvailabilityState, string> = {
  unset: "text-daet-ink/70 hover:bg-daet-sand/50",
  available: "bg-green-100 dark:bg-green-900/40 font-bold text-green-900 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800/60",
  unavailable: "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 line-through hover:bg-red-100 dark:hover:bg-red-900/40",
};
const LABEL: Record<AvailabilityState, string> = { unset: "not set", available: "available", unavailable: "not available" };

type Mark = Exclude<AvailabilityState, "unset"> | "hours";
type Hours = { start: string | null; end: string | null };

/**
 * Pick what a tap does (Available, Not available, or Set hours), then tap days.
 * Tapping a day that already has that mark clears it. "Set hours" opens the
 * day's hours (start and end, or all day). Assigned tours get a ring.
 */
export function AvailabilityCalendar({
  month,
  today,
  prevHref,
  nextHref,
  initial,
  tours,
}: {
  month: CalendarMonth;
  today: string;
  prevHref: string;
  nextHref: string;
  initial: Record<string, DayAvailability>;
  tours: Record<string, number>;
}) {
  const [states, setStates] = useState<Record<string, AvailabilityState>>(() =>
    Object.fromEntries(Object.entries(initial).map(([day, a]) => [day, a.available ? "available" : "unavailable"])),
  );
  const [hours, setHours] = useState<Record<string, Hours>>(() =>
    Object.fromEntries(Object.entries(initial).map(([day, a]) => [day, { start: toHHMM(a.start), end: toHHMM(a.end) }])),
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [mark, setMark] = useState<Mark>("available");
  const router = useRouter();

  const openHours = (day: string) => {
    const h = hours[day];
    setEditing(day);
    setSaved(null);
    setDraft({ start: h?.start ?? "08:00", end: h?.end ?? "17:00" });
  };

  const saveHours = (allDay: boolean) => {
    if (!editing) return;
    const day = editing;
    const start = allDay ? "" : draft.start;
    const end = allDay ? "" : draft.end;
    startTransition(async () => {
      const result = await setGuideHours(day, start, end);
      if (!result.success) return setError(result.error ?? "Your hours could not be saved.");
      setError(null);
      setStates((s) => ({ ...s, [day]: "available" }));
      setHours((h) => ({ ...h, [day]: { start: start || null, end: end || null } }));
      setSaved(`${formatDayHeading(day)}: ${hoursText(start || null, end || null)}.`);
      setEditing(null);
    });
  };

  const toggle = (day: string) => {
    if (mark === "hours") return openHours(day);
    const previous = states[day] ?? "unset";
    const next = markDay(previous, mark);
    setStates((s) => ({ ...s, [day]: next }));
    setHours((h) => ({ ...h, [day]: { start: null, end: null } }));
    startTransition(async () => {
      const result = await setGuideAvailability(day, next);
      if (!result.success) {
        setStates((s) => ({ ...s, [day]: previous }));
        setError(result.error ?? "Your availability could not be saved.");
      } else setError(null);
    });
  };

  const fillWeekends = () =>
    startTransition(async () => {
      const result = await markWeekendsAvailable();
      if (!result.success) return setError(result.error ?? "Your weekends could not be saved.");
      setError(null);
      setSaved(result.added ? `Marked ${result.added} weekend day${result.added === 1 ? "" : "s"} available.` : "Your weekends were already set.");
      router.refresh();
    });

  return (
    <div aria-busy={pending}>
      {error ? (
        <Notice variant="error" className="mb-3">
          {error}
        </Notice>
      ) : null}
      <div role="radiogroup" aria-label="A tap marks the day" className="mb-3 inline-flex rounded-full bg-muted p-1">
        {(
          [
            ["available", "Available"],
            ["unavailable", "Not available"],
            ["hours", "Set hours"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mark === value}
            onClick={() => setMark(value)}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-bold transition-colors ${
              mark === value
                ? value === "available"
                  ? "bg-green-500 text-slate-950 dark:bg-green-500/20 dark:text-green-300"
                  : value === "unavailable"
                    ? "bg-red-600 text-white dark:bg-red-500/20 dark:text-red-200"
                    : "bg-daet-forest text-white"
                : "text-daet-ink hover:bg-muted-strong"
            }`}
          >
            {mark === value ? <LineIcon name="check" className="h-4 w-4" /> : null}
            {label}
          </button>
        ))}
      </div>
      <MonthCalendar
        month={month}
        today={today}
        prevHref={prevHref}
        nextHref={nextHref}
        renderDay={(cell, isToday) => {
          const state = states[cell.dateKey] ?? "unset";
          const tourCount = tours[cell.dateKey] ?? 0;
          const past = cell.dateKey < today;
          const h = hours[cell.dateKey];
          const short = state === "available" ? shortHours(h?.start ?? null, h?.end ?? null) : null;
          return (
            <button
              type="button"
              data-hours={short ?? undefined}
              disabled={past}
              onClick={() => toggle(cell.dateKey)}
              aria-label={`${formatDayHeading(cell.dateKey)}: ${tourCount ? `on a tour (${tourCount}), ` : ""}${LABEL[state]}${state === "available" ? `, ${hoursText(h?.start ?? null, h?.end ?? null)}` : ""}`}
              className={`relative flex h-12 w-full flex-col after:text-[10px] after:font-normal after:leading-none after:content-[attr(data-hours)] items-center justify-center rounded-2xl text-sm transition disabled:cursor-default disabled:opacity-40 ${STYLE[state]} ${tourCount ? "ring-2 ring-daet-forest" : isToday ? "ring-2 ring-daet-forest/40" : ""}`}
            >
              {cell.day}
              {tourCount ? <span className="absolute bottom-1.5 h-1.5 w-1.5 rounded-full bg-daet-forest" aria-hidden="true" /> : null}
            </button>
          );
        }}
      />
      {editing ? (
        <section aria-label="Hours for the day" className="mt-4 rounded-2xl border border-line p-4">
          <h3 className="font-bold text-daet-ink">Hours on {formatDayHeading(editing)}</h3>
          <p className="mt-1 text-sm text-daet-ink/70">You&apos;ll only be given tours that fit inside these hours. Two tours can share a day when their times don&apos;t overlap.</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-sm">
            <Field id="hours-start" label="From">
              <Input type="time" step={900} value={draft.start} onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))} />
            </Field>
            <Field id="hours-end" label="Until">
              <Input type="time" step={900} value={draft.end} onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))} />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={() => saveHours(false)} disabled={pending}>
              Save hours
            </Button>
            <Button type="button" variant="secondary" onClick={() => saveHours(true)} disabled={pending}>
              Available all day
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </section>
      ) : null}
      <ul className="mt-3 flex flex-wrap gap-3 text-xs text-daet-ink/65">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-green-100 dark:bg-green-900/40" aria-hidden="true" /> Available
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-red-50 dark:bg-red-950/40 ring-1 ring-red-200" aria-hidden="true" /> Not available
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded ring-2 ring-daet-forest" aria-hidden="true" /> On a tour
        </li>
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={fillWeekends} disabled={pending}>
          Mark every Sat &amp; Sun available (8 weeks)
        </Button>
        {saved ? <p role="status" className="text-sm text-daet-ink/80">{saved}</p> : null}
      </div>
    </div>
  );
}
