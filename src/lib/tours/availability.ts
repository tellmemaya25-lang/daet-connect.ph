import { isDateKey } from "@/lib/tours/events-calendar";

/**
 * Open dates and capacity per package (tours_package_availability).
 * A package with no open dates accepts any future date (legacy mode); once
 * an operator opens dates, tourists can only book those, up to capacity.
 */

export const MAX_DATES_PER_BATCH = 120;
export const MAX_CAPACITY = 500;

export type AvailabilityRow = {
  id?: string;
  available_date: string;
  capacity_total: number;
  capacity_booked: number;
};

export function seatsLeft(row: Pick<AvailabilityRow, "capacity_total" | "capacity_booked">): number {
  return Math.max(0, row.capacity_total - row.capacity_booked);
}

const pad = (value: number) => String(value).padStart(2, "0");

function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function weekday(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Every date from start to end (inclusive) on the chosen weekdays (0 = Sunday). */
export function generateOpenDates(start: string, end: string, weekdays: number[]): string[] {
  if (!isDateKey(start) || !isDateKey(end) || end < start) return [];
  const allowed = new Set(weekdays);
  const dates: string[] = [];
  for (let key = start; key <= end && dates.length < MAX_DATES_PER_BATCH; key = addDays(key, 1)) {
    if (allowed.has(weekday(key))) dates.push(key);
  }
  return dates;
}

export type OpenDatesInput = { dates: string[]; capacity: number };
export type OpenDatesResult = { ok: true; data: OpenDatesInput } | { ok: false; errors: Record<string, string> };

/** Parses the "open dates" form: start, end, weekday checkboxes, seats per date. */
export function parseOpenDatesForm(formData: FormData, today: string): OpenDatesResult {
  const errors: Record<string, string> = {};
  const start = String(formData.get("startDate") ?? "").trim();
  const end = String(formData.get("endDate") ?? "").trim() || start;
  const capacityText = String(formData.get("capacity") ?? "").trim();
  const weekdays = formData
    .getAll("weekday")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);

  if (!isDateKey(start)) errors.startDate = "Choose a start date.";
  else if (start < today) errors.startDate = "Start date cannot be in the past.";
  if (!isDateKey(end)) errors.endDate = "Choose an end date.";
  else if (isDateKey(start) && end < start) errors.endDate = "End date must be on or after the start date.";

  if (weekdays.length === 0) errors.weekday = "Pick at least one day of the week.";

  const capacity = Number(capacityText);
  if (!/^\d+$/.test(capacityText) || capacity < 1) errors.capacity = "Enter how many guests you can take per date.";
  else if (capacity > MAX_CAPACITY) errors.capacity = `Capacity can be at most ${MAX_CAPACITY} per date.`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const dates = generateOpenDates(start, end, weekdays);
  if (dates.length === 0) return { ok: false, errors: { weekday: "No dates in that range fall on the chosen days." } };
  return { ok: true, data: { dates, capacity } };
}

export type DateOption = { date: string; seatsLeft: number; full: boolean };

/** Future open dates for the booking form (date ascending). */
export function bookableDates(rows: AvailabilityRow[], today: string): DateOption[] {
  return rows
    .filter((row) => row.available_date >= today)
    .sort((a, b) => a.available_date.localeCompare(b.available_date))
    .map((row) => ({ date: row.available_date, seatsLeft: seatsLeft(row), full: seatsLeft(row) === 0 }));
}
