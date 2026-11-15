/**
 * Guide availability by the hour (20261209). A day can be available all day
 * (no hours) or between a start and an end time. A tour fits when its window
 * (meeting time for the package's hours) sits inside the guide's hours.
 */

export type DayAvailability = { available: boolean; start: string | null; end: string | null };

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)(:\d\d)?$/;

/** "08:00:00" or "08:00" -> "08:00"; anything else -> null. */
export function toHHMM(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = HHMM.exec(value.trim());
  return m ? `${m[1]}:${m[2]}` : null;
}

export const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Validates a start and end picked by the guide. Both empty means all day. */
export function parseHours(start: string, end: string): { ok: true; start: string | null; end: string | null } | { ok: false; error: string } {
  const s = start.trim();
  const e = end.trim();
  if (!s && !e) return { ok: true, start: null, end: null };
  const a = toHHMM(s);
  const b = toHHMM(e);
  if (!a || !b) return { ok: false, error: "Enter both a start and an end time, or leave both empty for all day." };
  if (minutesOf(b) - minutesOf(a) < 30) return { ok: false, error: "The end time must be at least 30 minutes after the start." };
  return { ok: true, start: a, end: b };
}

/** "8:00 AM" for "08:00". */
export function clockText(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  const m = hhmm.slice(3, 5);
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

export function hoursText(start: string | null, end: string | null): string {
  return start && end ? `${clockText(start)} – ${clockText(end)}` : "All day";
}

/** Short label for a calendar cell: "8–11", "8:30–2". Null for all day. */
export function shortHours(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const part = (t: string) => {
    const h = Number(t.slice(0, 2)) % 12 || 12;
    return t.endsWith(":00") ? String(h) : `${h}:${t.slice(3, 5)}`;
  };
  return `${part(start)}–${part(end)}`;
}

/**
 * The minutes a tour takes, [start, end). Day tours, and hour tours without a
 * meeting time, take the whole day (same rule as tours_package_window).
 */
export function tourWindow(pkg: { duration_type?: string | null; duration_value?: number | null; meeting_time?: string | null }): [number, number] {
  const t = toHHMM(pkg.meeting_time ?? null);
  const hours = Number(pkg.duration_value);
  if (pkg.duration_type !== "hours" || !t || !(hours > 0)) return [0, 1440];
  const start = minutesOf(t);
  return [start, Math.min(1440, start + Math.max(1, Math.ceil(hours * 60)))];
}

/** Does a guide's day cover a tour's window? */
export function coversTour(day: DayAvailability | undefined, window: [number, number]): boolean {
  if (!day?.available) return false;
  if (!day.start || !day.end) return true;
  return minutesOf(day.start) <= window[0] && window[1] <= minutesOf(day.end);
}
