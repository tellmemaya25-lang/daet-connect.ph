import fc from "fast-check";
import { applyRefinement, preferencesKey } from "@/lib/tours/itinerary/refine";
import type { PlannerAttraction, Preferences } from "@/lib/tours/itinerary/types";
import { validatePlan } from "@/lib/tours/itinerary/validate";

const office = { mon: [["08:00", "17:00"]], tue: [["08:00", "17:00"]], wed: [["08:00", "17:00"]], thu: [["08:00", "17:00"]], fri: [["08:00", "17:00"]] } as const;
const list: PlannerAttraction[] = [
  { id: "rizal", name: "Rizal Monument", category: "heritage", lat: 14.1131, lng: 122.9545, hours: null, dwellMinutes: 20, fee: null },
  { id: "museum", name: "Heritage Center", category: "heritage", lat: 14.113187, lng: 122.954828, hours: office as never, dwellMinutes: 45, fee: null },
  { id: "bagasbas", name: "Bagasbas Beach", category: "beach", lat: 14.131583, lng: 122.985083, hours: null, dwellMinutes: 180, fee: null },
];
const byId = new Map(list.map((a) => [a.id, a]));
const prefs: Preferences = { startDate: "2026-11-06", days: 2, budgetPerDay: 500, interests: [], pace: "normal", groupSize: 2, dayStart: 480, dayEnd: 1080 };

describe("applyRefinement", () => {
  it("re-times a sensible suggestion and keeps only tips for planned stops", () => {
    const result = applyRefinement(
      {
        summary: "Heritage first, beach next.",
        days: [{ date: "2026-11-06", attractionIds: ["museum", "rizal"] }, { date: "2026-11-07", attractionIds: ["bagasbas"] }],
        tips: [{ attractionId: "museum", tip: "Go early." }, { attractionId: "nowhere", tip: "Ignored" }],
      },
      byId,
      prefs,
    );
    expect(result).not.toBeNull();
    expect(validatePlan(result!.plan, byId, prefs).ok).toBe(true);
    expect(result!.tips).toEqual({ museum: "Go early." });
  });

  it("rejects suggestions that break the rules", () => {
    // Museum on a Saturday is closed.
    expect(applyRefinement({ summary: "", days: [{ date: "2026-11-07", attractionIds: ["museum"] }, { date: "2026-11-08", attractionIds: [] }], tips: [] }, byId, prefs)).toBeNull();
    // Wrong number of days, or not the schema at all.
    expect(applyRefinement({ summary: "", days: [], tips: [] }, byId, prefs)).toBeNull();
    expect(applyRefinement({ plan: "do whatever" }, byId, prefs)).toBeNull();
  });

  it("never returns a plan that fails validation, whatever the model sends (property)", () => {
    const ids = fc.constantFrom("rizal", "museum", "bagasbas", "fake", "");
    const day = fc.record({ date: fc.constantFrom("2026-11-06", "2026-11-07", "2026-11-08", "bad"), attractionIds: fc.array(ids, { maxLength: 6 }) });
    const suggestion = fc.oneof(
      fc.record({ summary: fc.string(), days: fc.array(day, { maxLength: 3 }), tips: fc.array(fc.record({ attractionId: ids, tip: fc.string() })) }),
      fc.anything(),
    );
    fc.assert(
      fc.property(suggestion, (raw) => {
        const result = applyRefinement(raw, byId, prefs);
        if (result) expect(validatePlan(result.plan, byId, prefs).ok).toBe(true);
      }),
      { numRuns: 500 },
    );
  });
});

describe("preferencesKey", () => {
  it("ignores interest and attraction order", () => {
    expect(preferencesKey({ ...prefs, interests: ["beach", "food"] }, ["b", "a"])).toBe(preferencesKey({ ...prefs, interests: ["food", "beach"] }, ["a", "b"]));
  });
});
