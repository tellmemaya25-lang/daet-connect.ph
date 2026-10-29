import { formatPeso } from "@/lib/money";
import type { LatLng } from "@/lib/maps/geo";
import {
  addDays,
  DAY_ORIGIN,
  DAY_TRIP_MINUTES,
  effectiveHours,
  formatClock,
  LUNCH,
  openThroughout,
  planTotals,
  travelMinutes,
  visitCost,
  type Plan,
  type PlannerAttraction,
  type Preferences,
} from "@/lib/tours/itinerary/types";

/**
 * Constraint checker. Every plan shown to a tourist (rule-based, edited or
 * LLM-refined) must pass this; it re-derives everything from the dataset
 * instead of trusting the plan's own numbers.
 */

export type PlanIssue = { day: number; block?: number; message: string };
export type ValidationResult = { ok: boolean; issues: PlanIssue[] };

export function validatePlan(plan: Plan, attractions: Map<string, PlannerAttraction>, prefs: Preferences): ValidationResult {
  const issues: PlanIssue[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(plan.days) || plan.days.length !== prefs.days) {
    issues.push({ day: 0, message: `The plan must have ${prefs.days} day(s).` });
    return { ok: false, issues };
  }

  plan.days.forEach((day, d) => {
    if (day.date !== addDays(prefs.startDate, d)) issues.push({ day: d, message: "Days must be consecutive from the start date." });
    let previousEnd = prefs.dayStart;
    let position: LatLng = DAY_ORIGIN;
    let dayCost = 0;
    let lunchOk = false;
    let needsLunch = false;

    day.blocks.forEach((block, b) => {
      if (!Number.isInteger(block.start) || !Number.isInteger(block.end) || block.end <= block.start) {
        issues.push({ day: d, block: b, message: "A block has invalid times." });
        return;
      }
      if (block.start < prefs.dayStart || block.end > prefs.dayEnd) issues.push({ day: d, block: b, message: `${block.name} is outside the day (${formatClock(prefs.dayStart)}–${formatClock(prefs.dayEnd)}).` });
      if (block.end > LUNCH.latestStart) needsLunch = true;

      if (block.kind === "lunch") {
        if (block.start < previousEnd) issues.push({ day: d, block: b, message: "Lunch overlaps the previous stop." });
        if (block.start >= LUNCH.from && block.start <= LUNCH.latestStart && block.end - block.start >= 45) lunchOk = true;
        else issues.push({ day: d, block: b, message: "Lunch must start between 11:30 AM and 12:30 PM." });
        if (block.cost !== 0 || block.travelMinutes !== 0) issues.push({ day: d, block: b, message: "Lunch break has unexpected cost or travel." });
        previousEnd = block.end;
        return;
      }

      const attraction = attractions.get(block.attractionId);
      if (!attraction) {
        issues.push({ day: d, block: b, message: `Unknown place "${block.name}".` });
        return;
      }
      if (seen.has(attraction.id)) issues.push({ day: d, block: b, message: `${attraction.name} appears more than once.` });
      seen.add(attraction.id);

      const required = travelMinutes(position, attraction);
      if (block.travelMinutes < required) issues.push({ day: d, block: b, message: `Not enough travel time to reach ${attraction.name} (needs ${required} min).` });
      if (block.start < previousEnd + required) issues.push({ day: d, block: b, message: `${attraction.name} starts before you can get there.` });
      const { hours } = effectiveHours(attraction);
      if (!openThroughout(hours, day.date, block.start, block.end)) issues.push({ day: d, block: b, message: `${attraction.name} is not open for the whole visit.` });
      const expectedCost = visitCost(attraction, prefs.groupSize);
      if (Math.abs(block.cost - expectedCost) > 0.005) issues.push({ day: d, block: b, message: `Entrance cost for ${attraction.name} should be ${formatPeso(expectedCost)}.` });
      if (block.end - block.start >= DAY_TRIP_MINUTES && block.start <= LUNCH.from && block.end >= LUNCH.until) lunchOk = true;
      dayCost += expectedCost;
      previousEnd = block.end;
      position = attraction;
    });

    // Lunch: a lunch block, a day trip covering midday, or a free hour inside 11:30–13:30.
    if (needsLunch && !lunchOk && !hasFreeLunchHour(day.blocks)) issues.push({ day: d, message: "Leave time for lunch between 11:30 AM and 1:30 PM." });
    if (dayCost > prefs.budgetPerDay * prefs.groupSize + 0.005) issues.push({ day: d, message: `Entrance fees (${formatPeso(dayCost)}) are over the day's budget.` });
  });

  const totals = planTotals(plan.days);
  if (plan.totals && (Math.abs(plan.totals.cost - totals.cost) > 0.005 || plan.totals.visits !== totals.visits || plan.totals.travelMinutes !== totals.travelMinutes)) {
    issues.push({ day: 0, message: "Plan totals do not match its days." });
  }
  return { ok: issues.length === 0, issues };
}

function hasFreeLunchHour(blocks: Plan["days"][number]["blocks"]): boolean {
  const busy = blocks.map((b) => [Math.max(b.start - b.travelMinutes, LUNCH.from), Math.min(b.end, LUNCH.until)]).filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  let cursor = LUNCH.from;
  for (const [start, end] of busy) {
    if (start - cursor >= LUNCH.minutes) return true;
    cursor = Math.max(cursor, end);
  }
  return LUNCH.until - cursor >= LUNCH.minutes;
}
