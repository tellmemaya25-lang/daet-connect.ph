import type { PlannerAttraction, Preferences } from "@/lib/tours/itinerary/types";
import { visitCost } from "@/lib/tours/itinerary/types";

/**
 * Candidates for a plan: attractions whose entrance fee fits one day's
 * budget for the whole group. Interests are a soft preference (score.ts),
 * so a small dataset still produces full days.
 */
export function filterAttractions(attractions: PlannerAttraction[], prefs: Preferences): PlannerAttraction[] {
  const dailyBudget = prefs.budgetPerDay * prefs.groupSize;
  const seen = new Set<string>();
  return attractions.filter((attraction) => {
    if (seen.has(attraction.id)) return false;
    seen.add(attraction.id);
    return Number.isFinite(attraction.lat) && Number.isFinite(attraction.lng) && visitCost(attraction, prefs.groupSize) <= dailyBudget;
  });
}
