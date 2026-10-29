import { visitIds } from "@/lib/tours/itinerary/form";
import type { PlanDay } from "@/lib/tours/itinerary/types";

export type DayStats = {
  stops: number;
  travelMinutes: number;
  /** Entrance fees for the whole group. */
  groupCost: number;
  /** Entrance fees per person, for comparing with the per-person daily budget. */
  perPerson: number;
  /** Minutes after midnight when the last block ends, or null for a free day. */
  endsAt: number | null;
};

/** Numbers behind the "against your limits" meter for one day of a plan. */
export function dayStats(day: PlanDay, groupSize: number): DayStats {
  const groupCost = Math.round(day.blocks.reduce((sum, block) => sum + block.cost, 0) * 100) / 100;
  return {
    stops: visitIds(day.blocks).length,
    travelMinutes: day.blocks.reduce((sum, block) => sum + block.travelMinutes, 0),
    groupCost,
    perPerson: groupSize > 0 ? Math.round((groupCost / groupSize) * 100) / 100 : groupCost,
    endsAt: day.blocks.length ? Math.max(...day.blocks.map((block) => block.end)) : null,
  };
}

/** Share of a limit used, clamped to 0..100 for a progress bar. */
export function percentOf(value: number, limit: number): number {
  if (limit <= 0) return value > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, Math.round((value / limit) * 100)));
}
