import { monthLabel, parseGuideEarnings, parseGuideRevenue, parseMoneyEarnings } from "./earnings";

describe("parseGuideEarnings", () => {
  it("reads the guide's figures and tours, keeping a missing fee as null", () => {
    const g = parseGuideEarnings({
      completed_tours: 2,
      earned: "1600.00",
      upcoming_tours: 1,
      expected: 800,
      unpriced_tours: 1,
      tours: [
        { id: "b1", reference: "BK-1", date: "2026-11-01", title: "Calaguas", pax: 4, status: "completed", fee: "800.00" },
        { id: "b2", reference: "BK-2", date: "2026-11-02", title: "Falls", pax: 2, status: "completed", fee: null },
      ],
    });
    expect(g.earned).toBe(1600);
    expect(g.tours[0].fee).toBe(800);
    expect(g.tours[1].fee).toBeNull();
  });
  it("is all zeros for an empty answer", () => {
    expect(parseGuideEarnings(null)).toEqual({ completedTours: 0, earned: 0, upcomingTours: 0, expected: 0, unpricedTours: 0, tours: [] });
  });
});

describe("parseMoneyEarnings", () => {
  it("reads totals, operators and guides", () => {
    const m = parseMoneyEarnings({
      totals: { bookings: 3, booked: "9000", pickup_fees: "300", collected: "7000", refunded: "500", guide_fees: "1600", net: "4900" },
      operators: [{ id: "o1", name: "Kalmado", bookings: 3, booked: 9000, pickup_fees: 300, collected: 7000, refunded: 500, guide_fees: 1600, net: 4900 }],
      guides: [{ id: "g1", name: "Ana", completed_tours: 2, earned: 1600, expected: 0 }],
    });
    expect(m.totals.net).toBe(4900);
    expect(m.operators[0]).toMatchObject({ name: "Kalmado", collected: 7000, guideFees: 1600 });
    expect(m.guides[0]).toEqual({ id: "g1", name: "Ana", completedTours: 2, earned: 1600, expected: 0 });
  });
});

describe("parseGuideRevenue", () => {
  it("reads paid and owed, sorts operators by earnings and months by date", () => {
    const r = parseGuideRevenue({
      earned: "1500.00",
      paid: "900",
      owed: 600,
      paid_ids: ["b1", 7],
      operators: [
        { id: "o2", name: "Small", share_pct: null, tours: 1, earned: "300", owed: "300" },
        { id: "o1", name: "Kalmado", share_pct: "30.00", tours: 3, earned: "1200", owed: "300" },
      ],
      months: [{ month: "2026-11", tours: 2, earned: 1000 }, { month: "2026-10", tours: 2, earned: 500 }, { month: "bad", tours: 1, earned: 1 }],
    });
    expect(r).toMatchObject({ earned: 1500, paid: 900, owed: 600 });
    expect([...r.paidIds]).toEqual(["b1"]);
    expect(r.operators.map((o) => o.name)).toEqual(["Kalmado", "Small"]);
    expect(r.operators[0].sharePct).toBe(30);
    expect(r.operators[1].sharePct).toBeNull();
    expect(r.months.map((m) => m.month)).toEqual(["2026-10", "2026-11"]);
    expect(monthLabel("2026-11")).toMatch(/Nov.*2026/);
  });
  it("is empty for nothing", () => {
    expect(parseGuideRevenue(null)).toMatchObject({ earned: 0, paid: 0, owed: 0, operators: [], months: [] });
  });
});
