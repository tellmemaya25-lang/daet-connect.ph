import { isAttractionCategory, type AttractionCategory } from "@/lib/tours/attractions";
import { isDateKey } from "@/lib/tours/events-calendar";
import {
  addDays,
  MAX_DAYS,
  MAX_GROUP,
  PACES,
  parseClock,
  type Block,
  type Pace,
  type Plan,
  type PlannerAttraction,
  type Preferences,
} from "@/lib/tours/itinerary/types";

/** Planner request from the browser; everything is re-checked on the server. */
export type PlannerInput = {
  startDate: string;
  days: number;
  budgetPerDay: number;
  interests: string[];
  pace: string;
  groupSize: number;
  dayStart: string;
  dayEnd: string;
};

export function parsePreferences(input: Partial<PlannerInput>, today: string): { ok: true; prefs: Preferences } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const startDate = String(input.startDate ?? "");
  if (!isDateKey(startDate)) errors.startDate = "Choose a start date.";
  else if (startDate < today) errors.startDate = "Start date cannot be in the past.";
  else if (startDate > addDays(today, 365)) errors.startDate = "Plan within the next year.";

  const days = Number(input.days);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) errors.days = `Plan 1 to ${MAX_DAYS} days.`;
  const budget = Number(input.budgetPerDay);
  if (!Number.isFinite(budget) || budget < 0 || budget > 100000) errors.budgetPerDay = "Enter a budget from ₱0 to ₱100,000.";
  const groupSize = Number(input.groupSize);
  if (!Number.isInteger(groupSize) || groupSize < 1 || groupSize > MAX_GROUP) errors.groupSize = `Group size must be 1 to ${MAX_GROUP}.`;
  const pace = String(input.pace ?? "normal");
  if (!(PACES as readonly string[]).includes(pace)) errors.pace = "Choose a pace.";
  const interests = [...new Set((Array.isArray(input.interests) ? input.interests : []).filter(isAttractionCategory))] as AttractionCategory[];

  const dayStart = parseClock(String(input.dayStart ?? "08:00"));
  const dayEnd = parseClock(String(input.dayEnd ?? "18:00"));
  if (dayStart === null) errors.dayStart = "Enter a start time like 08:00.";
  if (dayEnd === null) errors.dayEnd = "Enter an end time like 18:00.";
  if (dayStart !== null && dayEnd !== null && dayEnd - dayStart < 4 * 60) errors.dayEnd = "Leave at least 4 hours between start and end.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    prefs: { startDate, days, budgetPerDay: Math.round(budget), interests, pace: pace as Pace, groupSize, dayStart: dayStart!, dayEnd: dayEnd! },
  };
}

const clockToTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const timeToClock = (value: string | null) => {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
};

export type ItineraryItemRow = {
  day_number: number;
  item_order: number;
  item_kind: "visit" | "lunch";
  location_name: string;
  attraction_id: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  tip: string | null;
  start_time: string;
  end_time: string;
  estimated_duration_minutes: number;
  travel_minutes: number;
  cost: number;
};

/** Plan → rows for tours_itinerary_items. */
export function planToRows(plan: Plan, byId: Map<string, PlannerAttraction>, tips: Record<string, string> = {}): ItineraryItemRow[] {
  return plan.days.flatMap((day, d) =>
    day.blocks.map((block, i) => {
      const attraction = block.kind === "visit" ? byId.get(block.attractionId) : undefined;
      return {
        day_number: d + 1,
        item_order: i,
        item_kind: block.kind,
        location_name: block.name,
        attraction_id: attraction?.id ?? null,
        latitude: attraction?.lat ?? null,
        longitude: attraction?.lng ?? null,
        description: null,
        tip: attraction ? (tips[attraction.id] ?? null) : null,
        start_time: clockToTime(block.start),
        end_time: clockToTime(block.end),
        estimated_duration_minutes: block.end - block.start,
        travel_minutes: block.travelMinutes,
        cost: block.cost,
      };
    }),
  );
}

export type SavedItem = {
  day_number: number;
  item_order: number;
  item_kind?: string | null;
  kind?: string | null;
  location_name: string;
  tip?: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  start_time: string | null;
  end_time: string | null;
  travel_minutes?: number | null;
  attraction_slug?: string | null;
};

export type SavedDay = {
  dayNumber: number;
  date: string | null;
  items: Array<{ kind: "visit" | "lunch"; name: string; start: number | null; end: number | null; travelMinutes: number; tip: string | null; lat: number | null; lng: number | null; slug: string | null }>;
};

/** Saved rows (own plan or shared view) → days for display. */
export function rowsToDays(rows: SavedItem[], startDate: string | null): SavedDay[] {
  const days = new Map<number, SavedDay>();
  for (const row of [...rows].sort((a, b) => a.day_number - b.day_number || a.item_order - b.item_order)) {
    const day = days.get(row.day_number) ?? { dayNumber: row.day_number, date: startDate ? addDays(startDate, row.day_number - 1) : null, items: [] };
    const kind = (row.item_kind ?? row.kind) === "lunch" ? "lunch" : "visit";
    const lat = row.latitude === null ? null : Number(row.latitude);
    const lng = row.longitude === null ? null : Number(row.longitude);
    day.items.push({
      kind,
      name: row.location_name,
      start: timeToClock(row.start_time),
      end: timeToClock(row.end_time),
      travelMinutes: row.travel_minutes ?? 0,
      tip: row.tip ?? null,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      slug: row.attraction_slug ?? null,
    });
    days.set(row.day_number, day);
  }
  return [...days.values()];
}

/** Plan block helpers for the UI. */
export function visitIds(blocks: Block[]): string[] {
  return blocks.flatMap((b) => (b.kind === "visit" ? [b.attractionId] : []));
}
