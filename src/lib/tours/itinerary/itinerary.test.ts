import fc from "fast-check";
import type { AttractionCategory } from "@/lib/tours/attractions";
import { generatePlan, scheduleOrder, withTotals } from "@/lib/tours/itinerary/schedule";
import { LUNCH, type Plan, type PlannerAttraction, type Preferences } from "@/lib/tours/itinerary/types";
import { validatePlan } from "@/lib/tours/itinerary/validate";
import type { OpeningHours } from "@/lib/tours/opening-hours";

const CATEGORIES: AttractionCategory[] = ["beach", "heritage", "nature", "park", "food", "adventure", "shopping", "religious"];
const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

const office: OpeningHours = { mon: [["08:00", "17:00"]], tue: [["08:00", "17:00"]], wed: [["08:00", "17:00"]], thu: [["08:00", "17:00"]], fri: [["08:00", "17:00"]] };
const seed: PlannerAttraction[] = [
  { id: "rizal", name: "First Rizal Monument", category: "heritage", lat: 14.1131, lng: 122.9545, hours: null, dwellMinutes: 20, fee: null },
  { id: "museum", name: "Daet Heritage Center", category: "heritage", lat: 14.113187, lng: 122.954828, hours: office, dwellMinutes: 45, fee: null },
  { id: "bagasbas", name: "Bagasbas Beach", category: "beach", lat: 14.131583, lng: 122.985083, hours: null, dwellMinutes: 180, fee: null },
  { id: "canimog", name: "Canimog Island", category: "nature", lat: 14.1136, lng: 123.0637, hours: null, dwellMinutes: 180, fee: 50 },
  { id: "apuao", name: "Apuao Grande", category: "beach", lat: 14.0823, lng: 123.1048, hours: null, dwellMinutes: 240, fee: 100 },
];
const byId = (list: PlannerAttraction[]) => new Map(list.map((a) => [a.id, a]));
const prefs = (overrides: Partial<Preferences> = {}): Preferences => ({
  startDate: "2026-11-06", // Friday
  days: 2,
  budgetPerDay: 500,
  interests: ["beach", "heritage"],
  pace: "normal",
  groupSize: 2,
  dayStart: 8 * 60,
  dayEnd: 18 * 60,
  ...overrides,
});

describe("generatePlan (seed data)", () => {
  it("builds a valid 2-day plan with lunch, no repeats, within budget", () => {
    const p = prefs();
    const plan = generatePlan(seed, p);
    const result = validatePlan(plan, byId(seed), p);
    expect(result.issues).toEqual([]);
    expect(plan.days.map((d) => d.date)).toEqual(["2026-11-06", "2026-11-07"]);
    const ids = plan.days.flatMap((d) => d.blocks.flatMap((b) => (b.kind === "visit" ? [b.attractionId] : [])));
    expect(new Set(ids).size).toBe(ids.length);
    expect(plan.totals.visits).toBe(ids.length);
    for (const day of plan.days) {
      const lunch = day.blocks.find((b) => b.kind === "lunch");
      if (day.blocks.some((b) => b.end > LUNCH.latestStart && b.end - b.start < 240)) expect(lunch).toBeDefined();
    }
  });

  it("schedules the museum only while it is open (closed on Saturday)", () => {
    const p = prefs({ startDate: "2026-11-07", days: 1, interests: ["heritage"] });
    const plan = generatePlan(seed, p);
    expect(plan.days[0].blocks.some((b) => b.kind === "visit" && b.attractionId === "museum")).toBe(false);
  });

  it("respects the budget and pace", () => {
    const cheap = generatePlan(seed, prefs({ budgetPerDay: 0 }));
    expect(cheap.days.flatMap((d) => d.blocks).every((b) => b.cost === 0)).toBe(true);
    const relaxed = generatePlan(seed, prefs({ pace: "relaxed", days: 1 }));
    expect(relaxed.days[0].blocks.filter((b) => b.kind === "visit").length).toBeLessThanOrEqual(3);
  });

  it("returns empty days instead of a lone lunch when nothing is left", () => {
    const plan = generatePlan(seed.slice(0, 1), prefs({ days: 3 }));
    expect(plan.days[2].blocks).toEqual([]);
    expect(validatePlan(plan, byId(seed), prefs({ days: 3 })).ok).toBe(true);
  });

  it("plans 300 attractions over 5 days quickly", () => {
    const many: PlannerAttraction[] = Array.from({ length: 300 }, (_, i) => ({
      id: `a${i}`, name: `Place ${i}`, category: CATEGORIES[i % CATEGORIES.length],
      lat: 14.05 + (i % 20) * 0.01, lng: 122.9 + Math.floor(i / 20) * 0.012, hours: i % 3 ? office : null, dwellMinutes: 30 + (i % 5) * 30, fee: i % 4 ? 20 : null,
    }));
    const p = prefs({ days: 5, pace: "packed" });
    const started = Date.now();
    const plan = generatePlan(many, p);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(validatePlan(plan, byId(many), p).ok).toBe(true);
  });
});

describe("validatePlan catches broken plans", () => {
  const p = prefs();
  const valid = generatePlan(seed, p);
  const firstVisit = (plan: Plan) => plan.days.flatMap((d, di) => d.blocks.map((b, bi) => ({ b, di, bi }))).find(({ b }) => b.kind === "visit")!;
  const clone = (plan: Plan): Plan => JSON.parse(JSON.stringify(plan));

  it("unknown ids, wrong cost, overlaps, closed times and repeats", () => {
    const unknown = clone(valid);
    const v1 = firstVisit(unknown);
    (unknown.days[v1.di].blocks[v1.bi] as { attractionId: string }).attractionId = "made-up";
    expect(validatePlan(unknown, byId(seed), p).ok).toBe(false);

    const cost = clone(valid);
    const v2 = firstVisit(cost);
    cost.days[v2.di].blocks[v2.bi].cost += 1;
    expect(validatePlan(cost, byId(seed), p).ok).toBe(false);

    const early = clone(valid);
    const v3 = firstVisit(early);
    early.days[v3.di].blocks[v3.bi].start = p.dayStart - 30;
    expect(validatePlan(early, byId(seed), p).ok).toBe(false);

    const repeat = clone(valid);
    const v4 = firstVisit(repeat);
    repeat.days[1].blocks.push({ ...repeat.days[v4.di].blocks[v4.bi], start: 16 * 60, end: 16 * 60 + 20 });
    expect(validatePlan(withTotals(repeat.days), byId(seed), p).ok).toBe(false);

    const wrongDays = clone(valid);
    wrongDays.days.pop();
    expect(validatePlan(wrongDays, byId(seed), p).ok).toBe(false);
  });
});

describe("scheduleOrder", () => {
  it("re-times a chosen order, adds lunch, and reports problems through validatePlan", () => {
    const p = prefs({ days: 1 });
    const day = scheduleOrder(p.startDate, ["museum", "rizal", "bagasbas"], byId(seed), p);
    expect(day.blocks.map((b) => b.kind)).toEqual(["visit", "visit", "lunch", "visit"]);
    expect(validatePlan(withTotals([day]), byId(seed), p).ok).toBe(true);
    // Saturday: the museum is closed, so the same order is flagged.
    const saturday = prefs({ days: 1, startDate: "2026-11-07" });
    const closed = scheduleOrder(saturday.startDate, ["museum"], byId(seed), saturday);
    expect(validatePlan(withTotals([closed]), byId(seed), saturday).issues[0].message).toContain("not open");
  });
});

// ---------------------------------------------------------------- properties
const hoursArb: fc.Arbitrary<OpeningHours | null> = fc.oneof(
  fc.constant(null),
  fc.tuple(fc.integer({ min: 5, max: 10 }), fc.integer({ min: 14, max: 21 }), fc.subarray(["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const, { minLength: 1 })).map(
    ([open, close, days]) => Object.fromEntries(days.map((d) => [d, [[hhmm(open * 60), hhmm(close * 60)]]])) as OpeningHours,
  ),
  fc.constant({ sat: [["09:00", "12:00"], ["13:00", "17:00"]], sun: [["09:00", "12:00"], ["13:00", "17:00"]] } as OpeningHours),
  fc.constant(Object.fromEntries(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((d) => [d, [["00:00", "24:00"]]])) as OpeningHours),
);

const attractionArb = (i: number): fc.Arbitrary<PlannerAttraction> =>
  fc.record({
    category: fc.constantFrom(...CATEGORIES),
    lat: fc.double({ min: 14.0, max: 14.5, noNaN: true }),
    lng: fc.double({ min: 122.85, max: 123.15, noNaN: true }),
    hours: hoursArb,
    dwellMinutes: fc.option(fc.integer({ min: 10, max: 360 }), { nil: null }),
    fee: fc.option(fc.integer({ min: 0, max: 600 }), { nil: null }),
  }).map((r) => ({ id: `p${i}`, name: `Place ${i}`, ...r }));

const attractionsArb = fc.integer({ min: 0, max: 25 }).chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => attractionArb(i))));

const prefsArb: fc.Arbitrary<Preferences> = fc.record({
  startDate: fc.date({ min: new Date("2026-01-01T00:00:00Z"), max: new Date("2027-12-31T00:00:00Z"), noInvalidDate: true }).map((d) => d.toISOString().slice(0, 10)),
  days: fc.integer({ min: 1, max: 5 }),
  budgetPerDay: fc.integer({ min: 0, max: 2000 }),
  interests: fc.subarray(CATEGORIES),
  pace: fc.constantFrom("relaxed", "normal", "packed"),
  groupSize: fc.integer({ min: 1, max: 10 }),
  dayStart: fc.integer({ min: 6, max: 10 }).map((h) => h * 60),
  dayEnd: fc.integer({ min: 15, max: 21 }).map((h) => h * 60),
});

describe("properties", () => {
  it("every rule-based plan passes the constraint checker", () => {
    fc.assert(
      fc.property(attractionsArb, prefsArb, (attractions, p) => {
        const plan = generatePlan(attractions, p);
        const result = validatePlan(plan, byId(attractions), p);
        if (!result.ok) throw new Error(JSON.stringify({ issues: result.issues, plan }, null, 1));
      }),
      { numRuns: 300 },
    );
  });

  it("any edit that moves a visit before its travel time is caught", () => {
    fc.assert(
      fc.property(attractionsArb, prefsArb, (attractions, p) => {
        const plan = generatePlan(attractions, p);
        // One minute earlier than the earliest possible arrival (previous end + travel).
        const spot = plan.days
          .flatMap((d) => d.blocks.map((b, i) => ({ b, previousEnd: i === 0 ? p.dayStart : d.blocks[i - 1].end })))
          .find(({ b }) => b.kind === "visit" && b.travelMinutes > 0);
        fc.pre(Boolean(spot));
        spot!.b.start = spot!.previousEnd + spot!.b.travelMinutes - 1;
        expect(validatePlan(plan, byId(attractions), p).ok).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});
