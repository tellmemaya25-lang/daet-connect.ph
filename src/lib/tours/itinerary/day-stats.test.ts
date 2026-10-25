import { dayStats, percentOf } from "@/lib/tours/itinerary/day-stats";
import type { PlanDay } from "@/lib/tours/itinerary/types";

const day: PlanDay = {
  date: "2026-11-16",
  blocks: [
    { kind: "visit", attractionId: "a", name: "A", start: 480, end: 500, travelMinutes: 0, cost: 100, hoursConfirmed: true },
    { kind: "visit", attractionId: "b", name: "B", start: 520, end: 600, travelMinutes: 20, cost: 50, hoursConfirmed: true },
    { kind: "lunch", name: "Lunch", start: 720, end: 780, travelMinutes: 0, cost: 0 },
  ],
};

describe("dayStats", () => {
  it("adds up stops, travel, fees and the finish time", () => {
    expect(dayStats(day, 3)).toEqual({ stops: 2, travelMinutes: 20, groupCost: 150, perPerson: 50, endsAt: 780 });
  });

  it("handles a free day", () => {
    expect(dayStats({ date: "2026-11-17", blocks: [] }, 2)).toEqual({ stops: 0, travelMinutes: 0, groupCost: 0, perPerson: 0, endsAt: null });
  });
});

describe("percentOf", () => {
  it("clamps to a bar width", () => {
    expect(percentOf(250, 500)).toBe(50);
    expect(percentOf(900, 500)).toBe(100);
    expect(percentOf(10, 0)).toBe(100);
    expect(percentOf(0, 0)).toBe(0);
  });
});
