import { averageRecentTours, guidesForPackage, moveInRanking, parseGuideStats, topGuides, underAssigned, type GuideStat } from "@/lib/tours/guide-management";

const guide = (over: Partial<GuideStat> & { id: string }): GuideStat => ({
  name: over.id.toUpperCase(),
  sharePct: null,
  freeDays: 5,
  upcoming: 0,
  recentTours: 0,
  completed: 0,
  earned: 0,
  revenue: 0,
  rating: null,
  reviews: 0,
  listedPackageIds: [],
  ledPackageIds: [],
  ...over,
});

describe("parseGuideStats", () => {
  it("reads the RPC's numbers and lists, defaulting what is missing", () => {
    const s = parseGuideStats({
      auto_assign: true,
      guides: [{ id: "g1", name: "Ana", share_pct: "30.00", free_days_30: 4, upcoming: 2, tours_30: 3, completed: 1, earned: "600.00", revenue: "2000.005", rating: "4.50", reviews: 2, listed_package_ids: ["p1"], led_package_ids: ["p1", 7] }, null],
      packages: [{ id: "p1", title: "Surf", guide_ids: ["g1"] }],
    });
    expect(s.autoAssign).toBe(true);
    expect(s.guides[0]).toMatchObject({ id: "g1", name: "Ana", sharePct: 30, freeDays: 4, recentTours: 3, earned: 600, revenue: 2000.01, rating: 4.5, ledPackageIds: ["p1"] });
    expect(s.packages).toEqual([{ id: "p1", title: "Surf", guideIds: ["g1"] }]);
    expect(parseGuideStats(null)).toEqual({ autoAssign: false, guides: [], packages: [] });
  });
});

describe("top and under-assigned guides", () => {
  const team = [
    guide({ id: "a", completed: 5, revenue: 9000, recentTours: 6 }),
    guide({ id: "b", completed: 5, revenue: 12000, recentTours: 5 }),
    guide({ id: "c", completed: 1, revenue: 1000, recentTours: 1 }),
    guide({ id: "d", completed: 0, recentTours: 0, freeDays: 0 }),
  ];
  it("ranks by completed tours, then revenue, skipping guides with none", () => {
    expect(topGuides(team).map((g) => g.id)).toEqual(["b", "a", "c"]);
  });
  it("flags free guides under half the team's average load", () => {
    expect(averageRecentTours(team)).toBe(3);
    // c has 1 (< 1.5) and is free; d has 0 but no free days, so assigning more can't help.
    expect(underAssigned(team).map((g) => g.id)).toEqual(["c"]);
    expect(underAssigned([guide({ id: "x" }), guide({ id: "y" })])).toEqual([]);
  });
});

describe("guidesForPackage", () => {
  it("splits the team into the package's ranked guides, past leaders and the rest", () => {
    const stats = {
      autoAssign: false,
      guides: [guide({ id: "a" }), guide({ id: "b", ledPackageIds: ["p1"] }), guide({ id: "c" })],
      packages: [{ id: "p1", title: "Surf", guideIds: ["c", "a", "gone"] }],
    };
    const r = guidesForPackage(stats, "p1");
    expect(r.listed.map((g) => g.id)).toEqual(["c", "a"]);
    expect(r.ledBefore.map((g) => g.id)).toEqual(["b"]);
    expect(r.others).toEqual([]);
  });
});

describe("moveInRanking", () => {
  it("swaps with the neighbour and stays put at the ends", () => {
    expect(moveInRanking(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveInRanking(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
    expect(moveInRanking(["a"], "x", 1)).toEqual(["a"]);
  });
});
