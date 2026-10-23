import type { AttractionCategory } from "@/lib/tours/attractions";
import { visitCost, type PlannerAttraction, type Preferences } from "@/lib/tours/itinerary/types";

/**
 * Higher is better: interest match, minus a cost penalty, minus a small
 * penalty for repeating a category the same day and for travel time.
 * (There is no popularity data yet; confirmed hours give a small bonus.)
 */
export function scoreAttraction(
  attraction: PlannerAttraction,
  prefs: Preferences,
  context: { categoriesToday: AttractionCategory[]; travelMinutes: number },
): number {
  const interest = prefs.interests.length === 0 ? 1 : prefs.interests.includes(attraction.category) ? 3 : 0;
  const dailyBudget = Math.max(1, prefs.budgetPerDay * prefs.groupSize);
  const costPenalty = (visitCost(attraction, prefs.groupSize) / dailyBudget) * 2;
  const repeatPenalty = context.categoriesToday.includes(attraction.category) ? 0.75 : 0;
  const travelPenalty = context.travelMinutes / 60;
  const hoursBonus = attraction.hours ? 0.2 : 0;
  return interest - costPenalty - repeatPenalty - travelPenalty + hoursBonus;
}
