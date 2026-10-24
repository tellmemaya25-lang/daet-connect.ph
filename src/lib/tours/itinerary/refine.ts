import { z } from "zod/v4";
import { scheduleOrder, withTotals } from "@/lib/tours/itinerary/schedule";
import type { Plan, PlannerAttraction, Preferences } from "@/lib/tours/itinerary/types";
import { validatePlan } from "@/lib/tours/itinerary/validate";

/**
 * What the language model may return (F7b). It only chooses and orders
 * places from the curated list and writes short tips; times, travel and
 * costs are recomputed by the engine and the result must pass validatePlan.
 */
export const RefinementSchema = z.object({
  summary: z.string(),
  days: z.array(z.object({ date: z.string(), attractionIds: z.array(z.string()) })),
  tips: z.array(z.object({ attractionId: z.string(), tip: z.string() })),
});
export type Refinement = z.infer<typeof RefinementSchema>;

export type RefinedPlan = { plan: Plan; summary: string | null; tips: Record<string, string> };

/** Applies a model suggestion; returns null whenever anything about it is off (caller keeps the draft). */
export function applyRefinement(raw: unknown, attractions: Map<string, PlannerAttraction>, prefs: Preferences): RefinedPlan | null {
  const parsed = RefinementSchema.safeParse(raw);
  if (!parsed.success) return null;
  const suggestion = parsed.data;
  if (suggestion.days.length !== prefs.days) return null;

  const days = suggestion.days.map((day) => {
    const unique = [...new Set(day.attractionIds)].filter((id) => attractions.has(id));
    return scheduleOrder(day.date, unique, attractions, prefs);
  });
  const plan = withTotals(days);
  if (!validatePlan(plan, attractions, prefs).ok) return null;

  const planned = new Set(plan.days.flatMap((d) => d.blocks.flatMap((b) => (b.kind === "visit" ? [b.attractionId] : []))));
  const tips: Record<string, string> = {};
  for (const { attractionId, tip } of suggestion.tips) {
    if (planned.has(attractionId) && tip.trim()) tips[attractionId] = tip.trim().slice(0, 240);
  }
  return { plan, summary: suggestion.summary.trim().slice(0, 600) || null, tips };
}

/** Stable key for caching a refinement by what the tourist asked for. */
export function preferencesKey(prefs: Preferences, attractionIds: string[]): string {
  return JSON.stringify({ ...prefs, interests: [...prefs.interests].sort(), ids: [...attractionIds].sort() });
}
