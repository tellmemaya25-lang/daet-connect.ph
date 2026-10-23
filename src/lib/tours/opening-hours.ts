/**
 * Opening hours stored as JSON: { "mon": [["08:00","17:00"]], ... }.
 * Days without a key are closed; `null` hours mean "not known". A window
 * whose end is earlier than its start runs past midnight. All times are
 * Manila time (UTC+8, no daylight saving).
 */

export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type TimeWindow = [string, string];
export type OpeningHours = Partial<Record<Weekday, TimeWindow[]>>;

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat",
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const MANILA_OFFSET_MS = 8 * 3600 * 1000;

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Validates hours read from the database or a form; anything malformed becomes null. */
export function parseOpeningHours(value: unknown): OpeningHours | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result: OpeningHours = {};
  for (const [day, windows] of Object.entries(value as Record<string, unknown>)) {
    if (!(WEEKDAYS as readonly string[]).includes(day) || !Array.isArray(windows)) return null;
    const clean: TimeWindow[] = [];
    for (const window of windows) {
      if (!Array.isArray(window) || window.length !== 2 || !window.every((t) => typeof t === "string" && TIME.test(t))) return null;
      if (window[0] === window[1] || window[0] === "24:00") return null;
      clean.push([window[0], window[1]]);
    }
    if (clean.length > 0) result[day as Weekday] = clean;
  }
  return result;
}

function manilaParts(date: Date): { day: number; minutes: number } {
  const shifted = new Date(date.getTime() + MANILA_OFFSET_MS);
  return { day: shifted.getUTCDay(), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
}

/** true/false, or null when hours are unknown. */
export function isOpenAt(hours: OpeningHours | null, date: Date): boolean | null {
  if (!hours) return null;
  const { day, minutes } = manilaParts(date);
  const today = hours[WEEKDAYS[day]] ?? [];
  const yesterday = hours[WEEKDAYS[(day + 6) % 7]] ?? [];
  for (const [open, close] of today) {
    const start = toMinutes(open);
    const end = toMinutes(close);
    if (end > start ? minutes >= start && minutes < end : minutes >= start) return true;
  }
  // Overnight windows from yesterday that are still running.
  for (const [open, close] of yesterday) {
    if (toMinutes(close) < toMinutes(open) && minutes < toMinutes(close)) return true;
  }
  return false;
}

export type NextOpening = { day: Weekday; opens: string; inDays: number };

/** The next time the place opens after `date` (within a week), or null. */
export function nextOpenWindow(hours: OpeningHours | null, date: Date): NextOpening | null {
  if (!hours) return null;
  const { day, minutes } = manilaParts(date);
  for (let offset = 0; offset < 8; offset += 1) {
    const key = WEEKDAYS[(day + offset) % 7];
    const windows = [...(hours[key] ?? [])].sort((a, b) => toMinutes(a[0]) - toMinutes(b[0]));
    for (const [open] of windows) {
      if (offset > 0 || toMinutes(open) > minutes) return { day: key, opens: open, inDays: offset };
    }
  }
  return null;
}

export type OpenStatus = { state: "open" | "closed" | "unknown"; label: string };

export function openStatus(hours: OpeningHours | null, date: Date = new Date()): OpenStatus {
  const open = isOpenAt(hours, date);
  if (open === null) return { state: "unknown", label: "Hours not listed" };
  if (open) return { state: "open", label: "Open now" };
  const next = nextOpenWindow(hours, date);
  if (!next) return { state: "closed", label: "Closed" };
  const when = next.inDays === 0 ? "today" : next.inDays === 1 ? "tomorrow" : WEEKDAY_LABELS[next.day];
  return { state: "closed", label: `Closed · opens ${when} ${formatTime(next.opens)}` };
}

export function formatTime(time: string): string {
  if (time === "24:00") return "12:00 AM";
  const [h, m] = time.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

const ALL_DAY: TimeWindow = ["00:00", "24:00"];

/** One line per day, Monday first: "Mon  8:00 AM – 5:00 PM". */
export function describeHours(hours: OpeningHours | null): Array<{ day: string; text: string }> {
  if (!hours) return [];
  const order: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  return order.map((day) => {
    const windows = hours[day] ?? [];
    if (windows.length === 0) return { day: WEEKDAY_LABELS[day], text: "Closed" };
    if (windows.some((w) => w[0] === ALL_DAY[0] && w[1] === ALL_DAY[1])) return { day: WEEKDAY_LABELS[day], text: "Open 24 hours" };
    return { day: WEEKDAY_LABELS[day], text: windows.map(([a, b]) => `${formatTime(a)} – ${formatTime(b)}`).join(", ") };
  });
}

const DAY_ALIASES: Record<string, Weekday> = {
  sun: "sun", sunday: "sun", mon: "mon", monday: "mon", tue: "tue", tues: "tue", tuesday: "tue",
  wed: "wed", wednesday: "wed", thu: "thu", thur: "thu", thurs: "thu", thursday: "thu",
  fri: "fri", friday: "fri", sat: "sat", saturday: "sat",
};

function expandDays(spec: string): Weekday[] | null {
  const text = spec.trim().toLowerCase();
  if (text === "daily" || text === "everyday" || text === "every day") return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const days: Weekday[] = [];
  for (const part of text.split(",")) {
    const [from, to] = part.split("-").map((s) => DAY_ALIASES[s.trim()]);
    if (!from || (part.includes("-") && !to)) return null;
    if (!to) {
      days.push(from);
      continue;
    }
    for (let i = WEEKDAYS.indexOf(from); ; i = (i + 1) % 7) {
      days.push(WEEKDAYS[i]);
      if (WEEKDAYS[i] === to) break;
    }
  }
  return days;
}

/**
 * Parses what admins type (also used by the CSV import):
 *   "Mon-Fri 08:00-17:00; Sat 09:00-12:00, 13:00-17:00; Sun closed"
 *   "Daily 06:00-18:00", "24/7". An empty string means "not listed" (null).
 */
export function parseHoursText(input: string): { ok: true; hours: OpeningHours | null } | { ok: false; error: string } {
  const text = input.trim();
  if (!text) return { ok: true, hours: null };
  if (/^(24\/7|open 24 hours|24 hours)$/i.test(text)) {
    return { ok: true, hours: Object.fromEntries(WEEKDAYS.map((d) => [d, [ALL_DAY]])) as OpeningHours };
  }
  const hours: OpeningHours = {};
  for (const clause of text.split(";").map((c) => c.trim()).filter(Boolean)) {
    const match = /^([a-z ,-]+?)\s+(closed|[\d:,\s-]+)$/i.exec(clause);
    const days = match ? expandDays(match[1]) : null;
    if (!match || !days) return { ok: false, error: `Could not read "${clause}". Use e.g. "Mon-Fri 08:00-17:00; Sun closed".` };
    if (/^closed$/i.test(match[2])) {
      for (const day of days) delete hours[day];
      continue;
    }
    const windows: TimeWindow[] = [];
    for (const range of match[2].split(",").map((r) => r.trim())) {
      const [open, close] = range.split("-").map((t) => t.trim().padStart(5, "0"));
      if (!open || !close || !TIME.test(open) || !TIME.test(close) || open === close || open === "24:00") {
        return { ok: false, error: `"${range}" is not a time range like 08:00-17:00.` };
      }
      windows.push([open, close]);
    }
    for (const day of days) hours[day] = windows;
  }
  return { ok: true, hours };
}

/** The reverse of parseHoursText, for pre-filling the admin form. */
export function hoursToText(hours: OpeningHours | null): string {
  if (!hours) return "";
  const lines = describeHours(hours);
  if (lines.every((line) => line.text === "Open 24 hours")) return "24/7";
  const order: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  return order
    .filter((day) => (hours[day] ?? []).length > 0)
    .map((day) => `${WEEKDAY_LABELS[day]} ${(hours[day] ?? []).map(([a, b]) => `${a}-${b}`).join(", ")}`)
    .join("; ");
}
