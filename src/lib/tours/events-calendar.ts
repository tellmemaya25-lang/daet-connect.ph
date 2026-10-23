/**
 * Pure date helpers for the public events calendar.
 *
 * All calendar days are Manila days. The Philippines has no daylight saving
 * time, so a fixed +08:00 offset is exact and avoids depending on the server's
 * time zone (Vercel runs in UTC).
 */

export const MANILA_TIME_ZONE = "Asia/Manila";
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Upper bound on how many calendar days one event may cover. */
export const MAX_EVENT_SPAN_DAYS = 62;

export type CalendarMonth = { year: number; month: number }; // month: 1-12

export type CalendarDay = {
  dateKey: string; // YYYY-MM-DD (Manila)
  day: number;
  inMonth: boolean;
};

export type CalendarEventLike = {
  id: string;
  starts_at: string;
  ends_at: string;
};

const pad = (value: number) => String(value).padStart(2, "0");

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Manila calendar day (YYYY-MM-DD) for an instant. */
export function toManilaDateKey(value: string | Date): string {
  const shifted = new Date(toDate(value).getTime() + MANILA_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** UTC instant of Manila midnight at the start of `dateKey`. */
export function manilaDayStartUtc(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - MANILA_OFFSET_MS);
}

function addDaysToKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function currentManilaMonth(now: Date = new Date()): CalendarMonth {
  const [year, month] = toManilaDateKey(now).split("-").map(Number);
  return { year, month };
}

/** Parses `?month=YYYY-MM`; falls back to the current Manila month. */
export function parseMonthParam(value: unknown, now: Date = new Date()): CalendarMonth {
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})$/.exec(value);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) {
        return { year, month };
      }
    }
  }
  return currentManilaMonth(now);
}

export function monthKey({ year, month }: CalendarMonth): string {
  return `${year}-${pad(month)}`;
}

export function shiftMonth({ year, month }: CalendarMonth, delta: number): CalendarMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function formatMonthLabel({ year, month }: CalendarMonth): string {
  return new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

/** Sunday-first weeks covering the whole month, padded with adjacent days. */
export function buildMonthGrid({ year, month }: CalendarMonth): CalendarDay[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leading = first.getUTCDay();
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < totalCells; i++) {
    const date = new Date(Date.UTC(year, month - 1, 1 - leading + i));
    const cell: CalendarDay = {
      dateKey: `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() === month - 1,
    };
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push(cell);
  }
  return weeks;
}

/** UTC range [start, end) covering every cell of the grid, for overlap queries. */
export function gridRangeUtc(grid: CalendarDay[][]): { startIso: string; endIso: string } {
  const firstKey = grid[0][0].dateKey;
  const lastWeek = grid[grid.length - 1];
  const lastKey = lastWeek[lastWeek.length - 1].dateKey;
  return {
    startIso: manilaDayStartUtc(firstKey).toISOString(),
    endIso: new Date(manilaDayStartUtc(lastKey).getTime() + DAY_MS).toISOString(),
  };
}

/** Every Manila day an event touches (capped at MAX_EVENT_SPAN_DAYS). */
export function eventDayKeys(event: Pick<CalendarEventLike, "starts_at" | "ends_at">): string[] {
  const startKey = toManilaDateKey(event.starts_at);
  const endKey = toManilaDateKey(
    toDate(event.ends_at).getTime() < toDate(event.starts_at).getTime() ? event.starts_at : event.ends_at,
  );

  const keys: string[] = [];
  let key = startKey;
  while (keys.length < MAX_EVENT_SPAN_DAYS) {
    keys.push(key);
    if (key === endKey) break;
    key = addDaysToKey(key, 1);
  }
  return keys;
}

/** Groups events by Manila day; each day's list is sorted by start time. */
export function groupEventsByDay<T extends CalendarEventLike>(events: T[]): Map<string, T[]> {
  const byDay = new Map<string, T[]>();
  const sorted = [...events].sort((a, b) => toDate(a.starts_at).getTime() - toDate(b.starts_at).getTime());
  for (const event of sorted) {
    for (const key of eventDayKeys(event)) {
      const list = byDay.get(key);
      if (list) list.push(event);
      else byDay.set(key, [event]);
    }
  }
  return byDay;
}

/** Converts a `datetime-local` value entered in Manila time to an ISO instant. */
export function manilaLocalToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const [y, mo, d, h, mi] = match.slice(1, 6).map(Number);
  const s = match[6] ? Number(match[6]) : 0;
  if (!isDateKey(`${match[1]}-${match[2]}-${match[3]}`) || h > 23 || mi > 59 || s > 59) return null;
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s) - MANILA_OFFSET_MS).toISOString();
}

/** Formats an ISO instant as a Manila `datetime-local` value (YYYY-MM-DDTHH:mm). */
export function isoToManilaLocal(value: string): string {
  const shifted = new Date(toDate(value).getTime() + MANILA_OFFSET_MS);
  return `${toManilaDateKey(value)}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: MANILA_TIME_ZONE,
});
const timeFormatter = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: MANILA_TIME_ZONE,
});

/** Human-readable Manila range, e.g. "Sat, Oct 24, 2026 · 9:00 AM – 5:00 PM". */
export function formatEventRange(startsAt: string, endsAt: string): string {
  const start = toDate(startsAt);
  const end = toDate(endsAt);
  if (toManilaDateKey(start) === toManilaDateKey(end)) {
    return `${dateFormatter.format(start)} · ${timeFormatter.format(start)} – ${timeFormatter.format(end)}`;
  }
  return `${dateFormatter.format(start)} ${timeFormatter.format(start)} – ${dateFormatter.format(end)} ${timeFormatter.format(end)}`;
}

export function formatDayHeading(dateKey: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T00:00:00Z`));
}

function icsDate(value: string): string {
  return toDate(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function icsEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
}

/** Minimal RFC 5545 calendar file for "Add to calendar". */
export function buildEventIcs(event: {
  id: string;
  title: string;
  description?: string | null;
  venue: string;
  starts_at: string;
  ends_at: string;
}, now: Date = new Date()): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CONNECT-DAET//Events//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${event.id}@connect-daet.ph`,
    `DTSTAMP:${icsDate(now.toISOString())}`,
    `DTSTART:${icsDate(event.starts_at)}`,
    `DTEND:${icsDate(event.ends_at)}`,
    `SUMMARY:${icsEscape(event.title)}`,
    `LOCATION:${icsEscape(event.venue)}`,
    ...(event.description ? [`DESCRIPTION:${icsEscape(event.description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
