import fc from "fast-check";
import { applyChangeRequest, matchAttractions, mergeTripFields, parseTripRequest, prefsToInput } from "@/lib/tours/itinerary/assistant";
import type { PlannerInput } from "@/lib/tours/itinerary/form";
import { generatePlan } from "@/lib/tours/itinerary/schedule";
import type { Plan, PlannerAttraction, Preferences } from "@/lib/tours/itinerary/types";
import { validatePlan } from "@/lib/tours/itinerary/validate";

const TODAY = "2026-10-24"; // Saturday
const base: PlannerInput = { startDate: "2026-10-25", days: 2, budgetPerDay: 500, interests: ["beach", "heritage"], pace: "normal", groupSize: 2, dayStart: "08:00", dayEnd: "18:00" };

const attractions: PlannerAttraction[] = [
  { id: "rizal", name: "First Rizal Monument", category: "heritage", lat: 14.1131, lng: 122.9545, hours: null, dwellMinutes: 20, fee: null },
  { id: "cathedral", name: "St. John the Baptist Church", category: "religious", lat: 14.1125, lng: 122.955, hours: null, dwellMinutes: 30, fee: null },
  { id: "bagasbas", name: "Bagasbas Beach", category: "beach", lat: 14.131583, lng: 122.985083, hours: null, dwellMinutes: 120, fee: null },
  { id: "surf", name: "Bagasbas Surf School", category: "adventure", lat: 14.1318, lng: 122.986, hours: null, dwellMinutes: 90, fee: 150 },
  { id: "pinyasan", name: "Pinyasan Food Strip", category: "food", lat: 14.114, lng: 122.956, hours: null, dwellMinutes: 45, fee: null },
  { id: "plaza", name: "Daet Plaza", category: "park", lat: 14.1129, lng: 122.9547, hours: null, dwellMinutes: 30, fee: null },
  { id: "market", name: "Daet Public Market", category: "shopping", lat: 14.1115, lng: 122.957, hours: null, dwellMinutes: 40, fee: null },
];
const byId = new Map(attractions.map((a) => [a.id, a]));
const prefs = (overrides: Partial<Preferences> = {}): Preferences => ({
  startDate: "2026-11-06",
  days: 2,
  budgetPerDay: 500,
  interests: ["beach", "heritage", "religious", "food"],
  pace: "normal",
  groupSize: 2,
  dayStart: 8 * 60,
  dayEnd: 18 * 60,
  ...overrides,
});
const ids = (plan: Plan) => plan.days.flatMap((d) => d.blocks.flatMap((b) => (b.kind === "visit" ? [b.attractionId] : [])));

describe("parseTripRequest", () => {
  it("reads days, group, kids, pace, budget, dates and interests", () => {
    const { input, understood } = parseTripRequest("3 days next weekend with my 2 kids, beaches and food, ₱300 each", TODAY, base);
    expect(input).toMatchObject({ days: 3, groupSize: 3, pace: "relaxed", budgetPerDay: 300, interests: ["beach", "food"], startDate: "2026-10-31" });
    expect(understood).toContain("relaxed pace (easier with kids or seniors)");
  });

  it("handles Taglish, nights, totals and times", () => {
    const { input } = parseTripRequest("2 nights kami ng asawa ko, simbahan at dagat, 2,000 pesos total, alis 7am hanggang 5pm", TODAY, base);
    expect(input).toMatchObject({ days: 3, groupSize: 2, interests: ["beach", "religious"], dayStart: "07:00", dayEnd: "17:00" });
    expect(input.budgetPerDay).toBe(333);
  });

  it("reads explicit and relative dates, never in the past", () => {
    expect(parseTripRequest("day trip tomorrow", TODAY, base).input).toMatchObject({ startDate: "2026-10-25", days: 1 });
    expect(parseTripRequest("from Nov 15 for 4 people", TODAY, base).input).toMatchObject({ startDate: "2026-11-15", groupSize: 4 });
    expect(parseTripRequest("January 3, surfing", TODAY, base).input).toMatchObject({ startDate: "2027-01-03", interests: ["adventure"] });
    expect(parseTripRequest("in 3 days, solo", TODAY, base).input).toMatchObject({ startDate: "2026-10-27", groupSize: 1, days: 2 });
    expect(parseTripRequest("2026-10-01", TODAY, base).input.startDate).toBe(TODAY);
  });

  it("caps long trips and keeps the form when nothing is recognised", () => {
    expect(parseTripRequest("10 days, packed", TODAY, base).input).toMatchObject({ days: 5, pace: "packed" });
    expect(parseTripRequest("hello there", TODAY, base)).toEqual({ input: base, understood: [] });
  });

  it("never throws and always returns form-shaped values", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 600 }), (text) => {
        const { input } = parseTripRequest(text, TODAY, base);
        expect(input.days).toBeGreaterThanOrEqual(1);
        expect(input.days).toBeLessThanOrEqual(5);
        expect(input.groupSize).toBeGreaterThanOrEqual(1);
        expect(input.budgetPerDay).toBeGreaterThanOrEqual(0);
        expect(input.startDate >= TODAY).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});

describe("mergeTripFields (model output)", () => {
  it("keeps only valid values and ignores the rest", () => {
    const { input, understood } = mergeTripFields(
      base,
      { startDate: "2020-01-01", days: 9, groupSize: 0, budgetPerDay: -5, interests: ["beach", "casino"], pace: "turbo", dayStart: "7am", dayEnd: "16:30", understood: ["Beach trip", "", 42 as unknown as string] },
      TODAY,
    );
    expect(input).toEqual({ ...base, startDate: TODAY, days: 5, groupSize: 1, budgetPerDay: 0, interests: ["beach"], dayEnd: "16:30" });
    expect(understood).toEqual(["Beach trip"]);
  });
});

describe("matchAttractions", () => {
  it("prefers distinctive name words over generic ones", () => {
    expect(matchAttractions("bagasbas beach", attractions).map((a) => a.id)).toEqual(["bagasbas"]);
    expect(matchAttractions("the surf school", attractions).map((a) => a.id)).toEqual(["surf"]);
    expect(matchAttractions("the beach", attractions)).toEqual([]);
  });
});

describe("applyChangeRequest", () => {
  const p = prefs();
  const plan = generatePlan(attractions, p);

  it("removes a category from one day", () => {
    const before = plan.days[0].blocks.some((b) => b.kind === "visit" && byId.get(b.attractionId)!.category === "religious");
    const result = applyChangeRequest("remove the church on day 1", plan, attractions, p);
    expect(result.plan.days[0].blocks.some((b) => b.kind === "visit" && byId.get(b.attractionId)!.category === "religious")).toBe(false);
    expect(result.changed).toBe(before);
    expect(validatePlan(result.plan, byId, result.prefs).ok).toBe(true);
  });

  it("adds a named place to a chosen day", () => {
    const without = applyChangeRequest("skip Bagasbas Beach", plan, attractions, p);
    expect(ids(without.plan)).not.toContain("bagasbas");
    const result = applyChangeRequest("add Bagasbas Beach to day 2", without.plan, attractions, without.prefs);
    expect(result.plan.days[1].blocks.some((b) => b.kind === "visit" && b.attractionId === "bagasbas")).toBe(true);
    expect(result.reply).toMatch(/added Bagasbas Beach to day 2/i);
  });

  it("changes pace and times for the whole trip", () => {
    const result = applyChangeRequest("make it more relaxed, start at 9am", plan, attractions, p);
    expect(result.prefs.pace).toBe("relaxed");
    expect(result.prefs.dayStart).toBe(9 * 60);
    expect(result.plan.days.every((d) => d.blocks.filter((b) => b.kind === "visit").length <= 3)).toBe(true);
    expect(validatePlan(result.plan, byId, result.prefs).ok).toBe(true);
  });

  it("handles several requests joined by 'and'", () => {
    const result = applyChangeRequest("make it more relaxed and start at 9am", plan, attractions, prefs({ pace: "relaxed" }));
    expect(result.prefs.dayStart).toBe(9 * 60);
    expect(result.reply).toMatch(/days now run 9:00 AM/);
  });

  it("swaps one place for another", () => {
    const start = applyChangeRequest("remove the market", plan, attractions, p);
    const inPlan = ids(start.plan).find((id) => id !== "market")!;
    const name = byId.get(inPlan)!.name;
    const result = applyChangeRequest(`swap ${name} for Daet Public Market`, start.plan, attractions, start.prefs);
    expect(ids(result.plan)).toContain("market");
    expect(ids(result.plan)).not.toContain(inPlan);
  });

  it("explains requests it can't follow and leaves the plan alone", () => {
    const result = applyChangeRequest("what's the weather like", plan, attractions, p);
    expect(result.changed).toBe(false);
    expect(result.plan).toBe(plan);
    expect(result.reply).toMatch(/didn't catch/);
    expect(applyChangeRequest("add something on day 9", plan, attractions, p).reply).toMatch(/no day 9/);
  });

  it("always returns a valid plan whatever the request", () => {
    const words = fc.constantFrom("add", "remove", "skip", "swap", "for", "more", "relaxed", "packed", "start at 6am", "finish by 1pm", "day 1", "day 2", "day 7", "church", "beach", "food", "bagasbas", "market", "surf", ",", "and then");
    fc.assert(
      fc.property(fc.array(words, { maxLength: 12 }), (parts) => {
        const result = applyChangeRequest(parts.join(" "), plan, attractions, p);
        expect(validatePlan(result.plan, byId, result.prefs).ok).toBe(true);
        expect(new Set(ids(result.plan)).size).toBe(ids(result.plan).length);
      }),
      { numRuns: 200 },
    );
  });

  it("round-trips preferences to the form shape", () => {
    expect(prefsToInput(prefs({ dayStart: 7 * 60 + 30 }))).toMatchObject({ dayStart: "07:30", dayEnd: "18:00", pace: "normal" });
  });
});
