import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ATTRACTION_CATEGORIES } from "@/lib/tours/attractions";
import { applyRefinement, preferencesKey, RefinementSchema, type RefinedPlan } from "@/lib/tours/itinerary/refine";
import { dwellFor, formatClock, type Plan, type PlannerAttraction, type Preferences } from "@/lib/tours/itinerary/types";
import { hoursToText } from "@/lib/tours/opening-hours";

/**
 * Optional LLM step (F7b), off unless ITINERARY_LLM=on and an Anthropic key
 * is configured. The model sees only our curated attractions and the
 * rule-based draft; whatever it returns is re-timed and validated, and any
 * failure (timeout, refusal, invalid plan) keeps the draft.
 */

const MODEL = "claude-opus-5-5";
const TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 6 * 3600 * 1000;
const cache = new Map<string, { at: number; value: RefinedPlan | null }>();

export function isLlmEnabled(): boolean {
  return process.env.ITINERARY_LLM === "on" && Boolean(process.env.ANTHROPIC_API_KEY);
}

const SYSTEM = [
  "You refine day-by-day sightseeing plans for Daet, Camarines Norte, Philippines.",
  "Use only the attractions in the provided JSON list, referenced by their exact id. Do not add places, facts, prices or hours that are not in the data.",
  "You may reorder stops, move a stop to another day, drop a stop, or add a listed stop the draft left out. Keep each day realistic: the planner will recompute times from your order and reject the plan if a place is closed, the day runs past its end time, or fees go over budget.",
  "Write a two-sentence summary and, for each planned stop, one short practical tip grounded in its description.",
].join(" ");

function describeDraft(draft: Plan): string {
  return draft.days
    .map((day) => `${day.date}: ${day.blocks.map((b) => (b.kind === "visit" ? `${b.attractionId} (${formatClock(b.start)}–${formatClock(b.end)})` : `lunch ${formatClock(b.start)}`)).join(", ") || "free day"}`)
    .join("\n");
}

export async function refineWithLlm(draft: Plan, attractions: PlannerAttraction[], prefs: Preferences): Promise<RefinedPlan | null> {
  if (!isLlmEnabled()) return null;
  const key = preferencesKey(prefs, attractions.map((a) => a.id));
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const data = attractions.map((a) => ({
    id: a.id,
    name: a.name,
    category: ATTRACTION_CATEGORIES[a.category],
    hours: a.hours ? hoursToText(a.hours) : "not listed (assume 8 AM–5 PM)",
    visit_minutes: dwellFor(a, prefs.pace),
    entrance_fee_per_person: a.fee,
  }));
  const request = [
    `Trip: ${prefs.days} day(s) from ${prefs.startDate}, ${formatClock(prefs.dayStart)}–${formatClock(prefs.dayEnd)} each day, pace ${prefs.pace}, group of ${prefs.groupSize}, entrance-fee budget ₱${prefs.budgetPerDay} per person per day.`,
    `Interests: ${prefs.interests.map((c) => ATTRACTION_CATEGORIES[c]).join(", ") || "anything"}.`,
    `Attractions (JSON): ${JSON.stringify(data)}`,
    `Draft plan:\n${describeDraft(draft)}`,
    `Return exactly ${prefs.days} day(s) with the same dates.`,
  ].join("\n\n");

  let value: RefinedPlan | null = null;
  try {
    const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 0 });
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: "user", content: request }],
      output_config: { effort: "low", format: zodOutputFormat(RefinementSchema) },
    });
    if (response.stop_reason === "end_turn" && response.parsed_output) {
      value = applyRefinement(response.parsed_output, new Map(attractions.map((a) => [a.id, a])), prefs);
    }
  } catch (error) {
    if (error instanceof Anthropic.APIError) console.error("Itinerary LLM error:", error.status, error.message);
    else console.error("Itinerary LLM error:", error);
    return null; // not cached, so a transient failure can be retried
  }
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return value;
}
