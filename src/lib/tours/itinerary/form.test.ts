import { parsePreferences, planToRows, rowsToDays } from "@/lib/tours/itinerary/form";
import { generatePlan } from "@/lib/tours/itinerary/schedule";
import type { PlannerAttraction } from "@/lib/tours/itinerary/types";

const today = "2026-10-23";
const valid = { startDate: "2026-11-06", days: 2, budgetPerDay: 300, interests: ["beach", "zoo"], pace: "relaxed", groupSize: 3, dayStart: "08:00", dayEnd: "17:30" };

describe("parsePreferences", () => {
  it("accepts a request and drops unknown interests", () => {
    const result = parsePreferences(valid, today);
    expect(result).toEqual({ ok: true, prefs: { startDate: "2026-11-06", days: 2, budgetPerDay: 300, interests: ["beach"], pace: "relaxed", groupSize: 3, dayStart: 480, dayEnd: 1050 } });
  });

  it("reports each problem", () => {
    const result = parsePreferences({ startDate: "2026-10-01", days: 9, budgetPerDay: -1, pace: "sprint", groupSize: 0, dayStart: "15:00", dayEnd: "17:00" }, today);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["budgetPerDay", "dayEnd", "days", "groupSize", "pace", "startDate"]);
  });
});

describe("planToRows / rowsToDays", () => {
  it("round-trips a plan for saving and display", () => {
    const attractions: PlannerAttraction[] = [
      { id: "a", name: "Rizal Monument", category: "heritage", lat: 14.1131, lng: 122.9545, hours: null, dwellMinutes: 30, fee: 20 },
      { id: "b", name: "Bagasbas Beach", category: "beach", lat: 14.131583, lng: 122.985083, hours: null, dwellMinutes: 180, fee: null },
    ];
    const parsed = parsePreferences({ ...valid, days: 1 }, today);
    if (!parsed.ok) throw new Error("bad prefs");
    const plan = generatePlan(attractions, parsed.prefs);
    const rows = planToRows(plan, new Map(attractions.map((x) => [x.id, x])), { a: "Look for the 1898 date." });
    expect(rows.every((r) => r.day_number === 1)).toBe(true);
    const days = rowsToDays(rows, "2026-11-06");
    expect(days[0].date).toBe("2026-11-06");
    expect(days[0].items.map((i) => i.name)).toEqual(plan.days[0].blocks.map((b) => b.name));
    expect(days[0].items.find((i) => i.name === "Rizal Monument")?.tip).toBe("Look for the 1898 date.");
    expect(days[0].items[0].start).toBe(plan.days[0].blocks[0].start);
  });
});
