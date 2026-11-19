import {
  MAX_SEATS,
  groupByKind,
  needSummary,
  parseNeedDraft,
  parseResourceDraft,
  resourceSummary,
  type Resource,
} from "@/lib/tours/operator-resources";

describe("parseResourceDraft", () => {
  it("accepts a boat with seats and a driver with none", () => {
    expect(parseResourceDraft({ kind: "boat", name: "Boat 1", seats: 12, units: 1 })).toEqual({
      ok: true,
      value: { kind: "boat", name: "Boat 1", seats: 12, units: 1, note: null },
    });
    expect(parseResourceDraft({ kind: "driver", name: "Mang Tonyo", seats: 0, units: 1 }).ok).toBe(true);
  });

  it("keeps a note and trims the name", () => {
    const r = parseResourceDraft({ kind: "van", name: "  Van A  ", seats: 10, units: 2, note: "  White  " });
    expect(r).toEqual({ ok: true, value: { kind: "van", name: "Van A", seats: 10, units: 2, note: "White" } });
  });

  it("rejects an unknown kind, an empty name or a name that is too long", () => {
    expect(parseResourceDraft({ kind: "submarine", name: "X", seats: 1, units: 1 }).ok).toBe(false);
    expect(parseResourceDraft({ kind: "boat", name: "   ", seats: 1, units: 1 }).ok).toBe(false);
    expect(parseResourceDraft({ kind: "boat", name: "x".repeat(81), seats: 1, units: 1 }).ok).toBe(false);
  });

  it("rejects seats or units outside the whole-number range", () => {
    expect(parseResourceDraft({ kind: "boat", name: "B", seats: -1, units: 1 }).ok).toBe(false);
    expect(parseResourceDraft({ kind: "boat", name: "B", seats: MAX_SEATS + 1, units: 1 }).ok).toBe(false);
    expect(parseResourceDraft({ kind: "boat", name: "B", seats: 12, units: 0 }).ok).toBe(false);
    expect(parseResourceDraft({ kind: "boat", name: "B", seats: 12.5, units: 1 }).ok).toBe(false);
  });

  it("only lets a driver carry no seats of its own", () => {
    expect(parseResourceDraft({ kind: "boat", name: "B", seats: 0, units: 1 }).ok).toBe(false);
    expect(parseResourceDraft({ kind: "van", name: "V", seats: 0, units: 1 }).ok).toBe(false);
  });
});

describe("parseNeedDraft", () => {
  it("accepts seats per guest, units per booking, or both", () => {
    expect(parseNeedDraft({ kind: "boat", seatsPerPax: 1, unitsPerBooking: 0 })).toEqual({
      ok: true,
      value: { kind: "boat", seats_per_pax: 1, units_per_booking: 0 },
    });
    expect(parseNeedDraft({ kind: "van", seatsPerPax: 0, unitsPerBooking: 1 }).ok).toBe(true);
    expect(parseNeedDraft({ kind: "van", seatsPerPax: 1, unitsPerBooking: 1 }).ok).toBe(true);
  });

  it("rejects a row that uses nothing, and out-of-range numbers", () => {
    expect(parseNeedDraft({ kind: "boat", seatsPerPax: 0, unitsPerBooking: 0 }).ok).toBe(false);
    expect(parseNeedDraft({ kind: "boat", seatsPerPax: 11, unitsPerBooking: 0 }).ok).toBe(false);
    expect(parseNeedDraft({ kind: "boat", seatsPerPax: 1, unitsPerBooking: 11 }).ok).toBe(false);
    expect(parseNeedDraft({ kind: "boat", seatsPerPax: -1, unitsPerBooking: 1 }).ok).toBe(false);
    expect(parseNeedDraft({ kind: "nope", seatsPerPax: 1, unitsPerBooking: 1 }).ok).toBe(false);
  });
});

describe("summaries", () => {
  it("reads a resource in one line", () => {
    expect(resourceSummary({ kind: "boat", seats: 12, units: 1 })).toBe("1 boat · 12 seats each");
    expect(resourceSummary({ kind: "boat", seats: 1, units: 1 })).toBe("1 boat · 1 seat each");
    expect(resourceSummary({ kind: "boat", seats: 12, units: 2 })).toBe("2 boats · 12 seats each");
    expect(resourceSummary({ kind: "driver", seats: 0, units: 1 })).toBe("1 driver");
  });

  it("reads what a tour needs in one line", () => {
    expect(needSummary({ kind: "boat", seats_per_pax: 1, units_per_booking: 0 })).toBe("1 boat seat per guest");
    expect(needSummary({ kind: "boat", seats_per_pax: 2, units_per_booking: 0 })).toBe("2 boat seats per guest");
    expect(needSummary({ kind: "van", seats_per_pax: 0, units_per_booking: 1 })).toBe("1 per booking");
    expect(needSummary({ kind: "van", seats_per_pax: 1, units_per_booking: 1 })).toBe("1 van seat per guest, 1 per booking");
  });
});

describe("groupByKind", () => {
  it("groups in canonical order and drops empty kinds", () => {
    const rows: Pick<Resource, "id" | "kind">[] = [
      { id: "a", kind: "van" },
      { id: "b", kind: "boat" },
      { id: "c", kind: "boat" },
    ];
    const groups = groupByKind(rows);
    expect(groups.map((g) => g.kind)).toEqual(["boat", "van"]);
    expect(groups[0].rows.map((r) => r.id)).toEqual(["b", "c"]);
    expect(groupByKind([])).toEqual([]);
  });
});
