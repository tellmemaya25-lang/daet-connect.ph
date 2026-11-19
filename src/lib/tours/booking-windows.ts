import { minutesOf, toHHMM, tourWindow } from "@/lib/tours/guide-hours";

/**
 * When a tour happens, for the tourist's own diary (20261221).
 *
 * The database is the authority: `tours_bookings_tourist_time_guard` refuses an
 * overlapping booking and `tours_booking_window` / `tours_occupied_dates` decide
 * what "overlapping" means. This module mirrors those rules so the booking form
 * can say why before the tourist submits, and so the rules can be unit tested.
 * If one side changes, the other must change with it.
 */

/** Minutes a tourist needs to get from one tour to the next. Mirrors tours_transfer_buffer(). */
export const TRANSFER_BUFFER_MIN = 45;

/** The most a window can hold: one day of minutes. */
const DAY = 1440;

export type TourTiming = {
  duration_type?: string | null;
  duration_value?: number | null;
  meeting_time?: string | null;
};

/** How many calendar days a booking takes. A day tour takes one. */
export function tourSpanDays(pkg: TourTiming): number {
  if (pkg.duration_type !== "days") return 1;
  const days = Math.floor(Number(pkg.duration_value));
  return Number.isFinite(days) && days > 1 ? days : 1;
}

/**
 * The minutes a tour takes on one of its days (1 = the tour date).
 * A multi-day trip starts at its meeting time on day 1 and holds every later
 * day whole, because a package has no return time. Mirrors tours_booking_window().
 */
export function bookingWindow(pkg: TourTiming, day = 1): [number, number] {
  if (tourSpanDays(pkg) <= 1) return tourWindow(pkg);
  if (day <= 1) {
    const start = minutesOf(toHHMM(pkg.meeting_time ?? null) ?? "00:00");
    return [start, DAY];
  }
  return [0, DAY];
}

/** The date offsets a booking occupies, e.g. [0, 1, 2] for a 3-day trip. */
export function occupiedDayOffsets(pkg: TourTiming): number[] {
  return Array.from({ length: tourSpanDays(pkg) }, (_, i) => i);
}

/** Does `date` fall inside the dates a booking starting on `start` occupies? */
export function occupiesDate(pkg: TourTiming, start: string, date: string): boolean {
  const from = dateKeyToDays(start);
  const to = dateKeyToDays(date);
  if (from === null || to === null) return false;
  return to >= from && to < from + tourSpanDays(pkg);
}

/** Widen a window by the buffer, kept inside the day. Mirrors tours_window_with_buffer(). */
export function windowWithBuffer(window: [number, number], buffer = TRANSFER_BUFFER_MIN): [number, number] {
  return [Math.max(0, window[0] - buffer), Math.min(DAY, window[1] + buffer)];
}

/** Half-open overlap, the same `&&` the database uses on int4range. */
export function windowsOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

/** A booking that can clash with a new one. Only active bookings occupy a calendar. */
export type OccupiedBooking = TourTiming & {
  id: string;
  package_id: string;
  tour_date: string;
  title: string;
  status?: string | null;
  number_of_pax?: number | null;
};

const ACTIVE = new Set(["pending", "confirmed"]);

/** "9:00 AM – 10:00 AM", "6:00 AM – midnight", or "all day". Mirrors tours_window_text(). */
export function windowText(window: [number, number]): string {
  if (window[0] <= 0 && window[1] >= DAY) return "all day";
  if (window[1] >= DAY) return `${clock(window[0])} – midnight`;
  return `${clock(window[0])} – ${clock(window[1])}`;
}

function clock(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** "2026-11-21" -> days since the epoch, or null when it is not a date key. */
export function dateKeyToDays(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const time = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(time) ? Math.round(time / 86_400_000) : null;
}

/** Days since the epoch -> "2026-11-21". */
export function daysToDateKey(days: number): string {
  const d = new Date(days * 86_400_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "21 Nov" for "2026-11-21". Matches to_char(date, 'DD Mon'), without the machine's locale or zone. */
export function shortDate(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month}` : key;
}

export type Clash = {
  booking: OccupiedBooking;
  /** The day the two tours run into each other, which may be later than the new date. */
  date: string;
  /** The window the existing booking takes on that day. */
  window: [number, number];
  /** True when the existing tour runs on the chosen date, false when it only spans it. */
  sameStartDate: boolean;
};

/**
 * The booking that stops this tourist taking `pkg` on `date`, or null.
 * Mirrors tours_tourist_busy_reason_for(): same active set, same date span, same
 * buffer, earliest clash first.
 *
 * Two directions matter. An existing multi-day trip can already be covering the
 * chosen date, and a new multi-day trip can run into a tour booked later in the
 * week — so both the existing booking's span and the new one's are checked.
 */
export function findTouristClash(
  pkg: TourTiming,
  date: string,
  bookings: readonly OccupiedBooking[],
  excludeBookingId?: string | null,
): Clash | null {
  const wanted = dateKeyToDays(date);
  if (wanted === null) return null;

  const newSpan = tourSpanDays(pkg);
  const newDays = new Set(Array.from({ length: newSpan }, (_, i) => wanted + i));

  const clashes: Clash[] = [];
  for (const booking of bookings) {
    if (excludeBookingId && booking.id === excludeBookingId) continue;
    if (booking.status != null && !ACTIVE.has(booking.status)) continue;

    const start = dateKeyToDays(booking.tour_date);
    if (start === null) continue;
    const span = tourSpanDays(booking);

    // The first day both bookings are running. Comparing windows on that shared
    // day is what the database does with daterange && int4range.
    let shared: number | null = null;
    for (let d = start; d < start + span; d += 1) {
      if (newDays.has(d)) {
        shared = d;
        break;
      }
    }
    if (shared === null) continue;

    // Only one side is widened, so the rule is "at least one buffer between the
    // tours" — widening both would quietly demand two.
    const existingWindow = windowWithBuffer(bookingWindow(booking, shared - start + 1));
    const newWindow = bookingWindow(pkg, shared - wanted + 1);
    if (!windowsOverlap(existingWindow, newWindow)) continue;

    clashes.push({
      booking,
      date: daysToDateKey(shared),
      window: bookingWindow(booking, shared - start + 1),
      sameStartDate: shared - start === 0,
    });
  }

  clashes.sort((a, b) =>
    a.booking.tour_date < b.booking.tour_date ? -1 : a.booking.tour_date > b.booking.tour_date ? 1 : a.booking.id < b.booking.id ? -1 : 1,
  );
  return clashes[0] ?? null;
}

/** The sentence the database would raise for this clash, word for word. */
export function clashMessage(clash: Clash): string {
  return (
    `This tour overlaps your booking for ${clash.booking.title} (${windowText(clash.window)}) ` +
    `on ${shortDate(clash.booking.tour_date)}. Pick another date, or cancel that booking first.`
  );
}

/** How a tourist's own booking reads in their diary: "9:00 AM – 10:00 AM" or "all day". */
export function bookingWindowText(booking: TourTiming, day = 1): string {
  return windowText(bookingWindow(booking, day));
}

/** One tour already in the tourist's day, as the booking form lists it. */
export type DayEntry = {
  booking: OccupiedBooking;
  /** The window this booking takes on the chosen date. */
  window: [number, number];
  /** True when the tour starts that day, false when a multi-day trip is passing through. */
  startsHere: boolean;
};

/**
 * Everything this tourist already has on `date`, in clock order.
 *
 * The booking guard needs only to know *that* a clash exists; the person booking
 * needs to see the whole day to judge whether another date would work. This is
 * the same rule as findTouristClash(), reported instead of merely refused.
 */
export function dayPlan(date: string, bookings: readonly OccupiedBooking[], excludeBookingId?: string | null): DayEntry[] {
  const wanted = dateKeyToDays(date);
  if (wanted === null) return [];

  const entries: DayEntry[] = [];
  for (const booking of bookings) {
    if (excludeBookingId && booking.id === excludeBookingId) continue;
    if (booking.status != null && !ACTIVE.has(booking.status)) continue;
    if (!occupiesDate(booking, booking.tour_date, date)) continue;

    const start = dateKeyToDays(booking.tour_date);
    if (start === null) continue;
    const day = wanted - start + 1;
    entries.push({ booking, window: bookingWindow(booking, day), startsHere: day === 1 });
  }

  // Earliest first; a tie falls back to the title so the list is stable.
  entries.sort((a, b) => a.window[0] - b.window[0] || a.booking.title.localeCompare(b.booking.title));
  return entries;
}

/** Total minutes of the day the entries already take. Whole days win outright. */
export function dayMinutesTaken(entries: readonly DayEntry[]): number {
  if (entries.length === 0) return 0;
  // Merge overlapping windows so a whole-day tour plus a short one does not add to 1440+60.
  const spans = [...entries].map((e) => e.window).sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [start, end] = spans[0];
  for (const [from, to] of spans.slice(1)) {
    if (from > end) {
      total += end - start;
      start = from;
      end = to;
    } else {
      end = Math.max(end, to);
    }
  }
  return total + (end - start);
}

/** "no time left" / "4 hours free" — the sentence under the timeline. */
export function freeTimeText(entries: readonly DayEntry[]): string {
  const taken = dayMinutesTaken(entries);
  if (taken >= DAY) return "no time left that day";
  const free = DAY - taken;
  const hours = Math.floor(free / 60);
  const minutes = free % 60;
  if (hours === 0) return `${minutes} minute${minutes === 1 ? "" : "s"} free`;
  if (minutes === 0) return `${hours} hour${hours === 1 ? "" : "s"} free`;
  return `${hours}h ${minutes}m free`;
}
