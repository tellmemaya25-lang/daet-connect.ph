import fc from "fast-check";
import {
  bookableDates,
  generateOpenDates,
  MAX_DATES_PER_BATCH,
  parseOpenDatesForm,
  seatsLeft,
} from "@/lib/tours/availability";

function form(values: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}

describe("generateOpenDates", () => {
  it("returns the chosen weekdays in range", () => {
    // Nov 2026: Sat 7, 14, 21, 28; Sun 1, 8, 15, 22, 29.
    expect(generateOpenDates("2026-11-01", "2026-11-15", [0, 6])).toEqual([
      "2026-11-01", "2026-11-07", "2026-11-08", "2026-11-14", "2026-11-15",
    ]);
  });

  it("crosses month and year boundaries", () => {
    expect(generateOpenDates("2026-12-30", "2027-01-02", [0, 1, 2, 3, 4, 5, 6])).toEqual([
      "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02",
    ]);
  });

  it("handles leap days and rejects bad input", () => {
    expect(generateOpenDates("2028-02-28", "2028-03-01", [0, 1, 2, 3, 4, 5, 6])).toHaveLength(3);
    expect(generateOpenDates("2026-11-10", "2026-11-01", [1])).toEqual([]);
    expect(generateOpenDates("2026-02-30", "2026-03-01", [1])).toEqual([]);
  });

  it("caps a batch and only returns allowed weekdays, ascending and unique (property)", () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date("2026-01-01T00:00:00Z"), max: new Date("2030-12-31T00:00:00Z"), noInvalidDate: true }),
        fc.integer({ min: 0, max: 400 }),
        fc.uniqueArray(fc.integer({ min: 0, max: 6 }), { minLength: 1, maxLength: 7 }),
        (start, span, weekdays) => {
          const startKey = start.toISOString().slice(0, 10);
          const end = new Date(start.getTime() + span * 86400000).toISOString().slice(0, 10);
          const dates = generateOpenDates(startKey, end, weekdays);
          expect(dates.length).toBeLessThanOrEqual(MAX_DATES_PER_BATCH);
          expect([...dates].sort()).toEqual(dates);
          expect(new Set(dates).size).toBe(dates.length);
          for (const date of dates) {
            expect(weekdays).toContain(new Date(`${date}T00:00:00Z`).getUTCDay());
            expect(date >= startKey && date <= end).toBe(true);
          }
        },
      ),
    );
  });
});

describe("parseOpenDatesForm", () => {
  const today = "2026-10-23";

  it("builds dates and capacity", () => {
    const result = parseOpenDatesForm(form({ startDate: "2026-11-01", endDate: "2026-11-08", weekday: ["6"], capacity: "12" }), today);
    expect(result).toEqual({ ok: true, data: { dates: ["2026-11-07"], capacity: 12 } });
  });

  it("defaults the end date to the start date", () => {
    const result = parseOpenDatesForm(form({ startDate: "2026-11-07", weekday: ["6"], capacity: "5" }), today);
    expect(result.ok && result.data.dates).toEqual(["2026-11-07"]);
  });

  it("reports every problem", () => {
    const result = parseOpenDatesForm(form({ startDate: "2026-10-01", endDate: "2026-09-01", capacity: "0" }), today);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["capacity", "endDate", "startDate", "weekday"]);
  });

  it("explains when no dates match", () => {
    const result = parseOpenDatesForm(form({ startDate: "2026-11-02", endDate: "2026-11-03", weekday: ["6"], capacity: "5" }), today);
    expect(!result.ok && result.errors.weekday).toContain("No dates");
  });

  it.each(["1.5", "abc", "-3", "501"])("rejects capacity %p", (capacity) => {
    expect(parseOpenDatesForm(form({ startDate: "2026-11-07", weekday: ["6"], capacity }), today).ok).toBe(false);
  });
});

describe("seatsLeft / bookableDates", () => {
  it("never goes negative", () => {
    expect(seatsLeft({ capacity_total: 10, capacity_booked: 4 })).toBe(6);
    expect(seatsLeft({ capacity_total: 10, capacity_booked: 12 })).toBe(0);
  });

  it("lists future dates in order and marks full ones", () => {
    const rows = [
      { available_date: "2026-11-14", capacity_total: 10, capacity_booked: 10 },
      { available_date: "2026-10-01", capacity_total: 10, capacity_booked: 0 },
      { available_date: "2026-11-07", capacity_total: 10, capacity_booked: 3 },
    ];
    expect(bookableDates(rows, "2026-10-23")).toEqual([
      { date: "2026-11-07", seatsLeft: 7, full: false },
      { date: "2026-11-14", seatsLeft: 0, full: true },
    ]);
  });
});
