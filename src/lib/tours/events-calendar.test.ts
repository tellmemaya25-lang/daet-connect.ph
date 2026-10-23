import fc from "fast-check";
import {
  buildEventIcs,
  buildMonthGrid,
  eventDayKeys,
  formatEventRange,
  gridRangeUtc,
  groupEventsByDay,
  isDateKey,
  isoToManilaLocal,
  manilaLocalToIso,
  MAX_EVENT_SPAN_DAYS,
  monthKey,
  parseMonthParam,
  shiftMonth,
  toManilaDateKey,
} from "@/lib/tours/events-calendar";

describe("toManilaDateKey", () => {
  it("uses the Manila day, not the UTC day", () => {
    // 2026-10-23 17:30 UTC is 2026-10-24 01:30 in Manila.
    expect(toManilaDateKey("2026-10-23T17:30:00Z")).toBe("2026-10-24");
    expect(toManilaDateKey("2026-10-23T15:59:59Z")).toBe("2026-10-23");
    expect(toManilaDateKey("2026-10-23T16:00:00Z")).toBe("2026-10-24");
  });
});

describe("isDateKey", () => {
  it("accepts real dates only", () => {
    expect(isDateKey("2028-02-29")).toBe(true);
    expect(isDateKey("2026-02-29")).toBe(false);
    expect(isDateKey("2026-13-01")).toBe(false);
    expect(isDateKey("2026-1-01")).toBe(false);
    expect(isDateKey(undefined)).toBe(false);
  });
});

describe("parseMonthParam / shiftMonth", () => {
  const now = new Date("2026-10-23T03:00:00Z");

  it("parses valid YYYY-MM values", () => {
    expect(parseMonthParam("2027-01", now)).toEqual({ year: 2027, month: 1 });
  });

  it("falls back to the current Manila month for invalid input", () => {
    for (const value of [undefined, "", "2026-13", "abc", ["2026-01"], "1999-05"]) {
      expect(parseMonthParam(value, now)).toEqual({ year: 2026, month: 10 });
    }
  });

  it("uses the Manila month at a UTC month boundary", () => {
    expect(parseMonthParam(undefined, new Date("2026-10-31T17:00:00Z"))).toEqual({ year: 2026, month: 11 });
  });

  it("wraps across years", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(monthKey(shiftMonth({ year: 2026, month: 10 }, -22))).toBe("2024-12");
  });

  it("round-trips any shift", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2000, max: 2100 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: -500, max: 500 }), (year, month, delta) => {
        expect(shiftMonth(shiftMonth({ year, month }, delta), -delta)).toEqual({ year, month });
      }),
    );
  });
});

describe("buildMonthGrid", () => {
  it("builds Sunday-first full weeks for October 2026", () => {
    const grid = buildMonthGrid({ year: 2026, month: 10 });
    // Oct 1, 2026 is a Thursday → 4 leading days from September.
    expect(grid[0].map((d) => d.dateKey)).toEqual([
      "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03",
    ]);
    expect(grid[0][3].inMonth).toBe(false);
    expect(grid[0][4].inMonth).toBe(true);
    expect(grid).toHaveLength(5);
  });

  it("always contains every day of the month exactly once, in 7-day rows", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2000, max: 2100 }), fc.integer({ min: 1, max: 12 }), (year, month) => {
        const grid = buildMonthGrid({ year, month });
        const cells = grid.flat();
        const inMonth = cells.filter((c) => c.inMonth);
        const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

        expect(grid.every((week) => week.length === 7)).toBe(true);
        expect(inMonth.map((c) => c.day)).toEqual(Array.from({ length: daysInMonth }, (_, i) => i + 1));
        expect(new Set(cells.map((c) => c.dateKey)).size).toBe(cells.length);
        expect(grid.length).toBeGreaterThanOrEqual(4);
        expect(grid.length).toBeLessThanOrEqual(6);
      }),
    );
  });

  it("produces a UTC range from first-cell Manila midnight to after the last cell", () => {
    const grid = buildMonthGrid({ year: 2026, month: 10 });
    expect(gridRangeUtc(grid)).toEqual({
      startIso: "2026-09-26T16:00:00.000Z",
      endIso: "2026-10-31T16:00:00.000Z",
    });
  });
});

describe("eventDayKeys / groupEventsByDay", () => {
  it("lists every Manila day a multi-day event touches", () => {
    expect(
      eventDayKeys({ starts_at: "2026-10-30T10:00:00+08:00", ends_at: "2026-11-02T02:00:00+08:00" }),
    ).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("treats an end before the start as a single-day event", () => {
    expect(eventDayKeys({ starts_at: "2026-10-30T10:00:00+08:00", ends_at: "2026-10-29T10:00:00+08:00" })).toEqual(["2026-10-30"]);
  });

  it("caps very long spans", () => {
    expect(eventDayKeys({ starts_at: "2026-01-01T00:00:00Z", ends_at: "2027-01-01T00:00:00Z" })).toHaveLength(MAX_EVENT_SPAN_DAYS);
  });

  it("groups events by day sorted by start time", () => {
    const events = [
      { id: "late", starts_at: "2026-10-24T18:00:00+08:00", ends_at: "2026-10-24T21:00:00+08:00" },
      { id: "fiesta", starts_at: "2026-10-23T08:00:00+08:00", ends_at: "2026-10-25T17:00:00+08:00" },
      { id: "early", starts_at: "2026-10-24T06:00:00+08:00", ends_at: "2026-10-24T07:00:00+08:00" },
    ];
    const byDay = groupEventsByDay(events);
    expect(byDay.get("2026-10-23")?.map((e) => e.id)).toEqual(["fiesta"]);
    expect(byDay.get("2026-10-24")?.map((e) => e.id)).toEqual(["fiesta", "early", "late"]);
    expect(byDay.get("2026-10-25")?.map((e) => e.id)).toEqual(["fiesta"]);
    expect(byDay.has("2026-10-26")).toBe(false);
  });
});

describe("Manila datetime-local conversion", () => {
  it("converts form input to UTC and back", () => {
    expect(manilaLocalToIso("2026-10-24T09:00")).toBe("2026-10-24T01:00:00.000Z");
    expect(manilaLocalToIso("2026-10-24T00:30")).toBe("2026-10-23T16:30:00.000Z");
    expect(isoToManilaLocal("2026-10-23T16:30:00.000Z")).toBe("2026-10-24T00:30");
  });

  it("rejects malformed or impossible values", () => {
    for (const value of ["", "2026-10-24", "2026-02-30T10:00", "2026-10-24T24:00", "2026-10-24T10:60", "not a date"]) {
      expect(manilaLocalToIso(value)).toBeNull();
    }
  });

  it("round-trips any minute", () => {
    fc.assert(
      fc.property(fc.date({ min: new Date("2000-01-01T00:00:00Z"), max: new Date("2099-12-31T00:00:00Z"), noInvalidDate: true }), (date) => {
        const minute = new Date(Math.floor(date.getTime() / 60000) * 60000).toISOString();
        expect(manilaLocalToIso(isoToManilaLocal(minute))).toBe(minute);
      }),
    );
  });
});

describe("formatEventRange", () => {
  it("shows one date for same-day events", () => {
    const text = formatEventRange("2026-10-24T01:00:00Z", "2026-10-24T09:00:00Z");
    expect(text).toContain("Oct 24, 2026");
    expect(text.match(/2026/g)).toHaveLength(1);
  });

  it("shows both dates for multi-day events", () => {
    const text = formatEventRange("2026-10-24T01:00:00Z", "2026-10-26T09:00:00Z");
    expect(text).toContain("Oct 24");
    expect(text).toContain("Oct 26");
  });
});

describe("buildEventIcs", () => {
  it("builds a valid VEVENT with escaped text", () => {
    const ics = buildEventIcs(
      {
        id: "abc",
        title: "Pinyasan Festival; Street Dance",
        description: "Line one\nLine two, with comma",
        venue: "Daet Plaza",
        starts_at: "2026-06-15T00:00:00.000Z",
        ends_at: "2026-06-15T10:00:00.000Z",
      },
      new Date("2026-06-01T00:00:00Z"),
    );
    expect(ics).toContain("BEGIN:VEVENT\r\n");
    expect(ics).toContain("UID:abc@connect-daet.ph");
    expect(ics).toContain("DTSTART:20260615T000000Z");
    expect(ics).toContain("DTEND:20260615T100000Z");
    expect(ics).toContain("DTSTAMP:20260601T000000Z");
    expect(ics).toContain("SUMMARY:Pinyasan Festival\\; Street Dance");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two\\, with comma");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
