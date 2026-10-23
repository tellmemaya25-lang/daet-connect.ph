import fc from "fast-check";
import {
  describeHours,
  hoursToText,
  isOpenAt,
  nextOpenWindow,
  openStatus,
  parseHoursText,
  parseOpeningHours,
  type OpeningHours,
} from "@/lib/tours/opening-hours";

// Manila time = UTC+8. 2026-10-23 is a Friday.
const manila = (local: string) => new Date(`${local}+08:00`);
const office: OpeningHours = { mon: [["08:00", "17:00"]], tue: [["08:00", "17:00"]], wed: [["08:00", "17:00"]], thu: [["08:00", "17:00"]], fri: [["08:00", "17:00"]] };

describe("isOpenAt", () => {
  it("uses Manila time and half-open windows", () => {
    expect(isOpenAt(office, manila("2026-10-23T08:00:00"))).toBe(true);
    expect(isOpenAt(office, manila("2026-10-23T16:59:00"))).toBe(true);
    expect(isOpenAt(office, manila("2026-10-23T17:00:00"))).toBe(false);
    expect(isOpenAt(office, manila("2026-10-24T10:00:00"))).toBe(false); // Saturday
    // 2026-10-23T01:00Z is 09:00 in Manila even though it is still Thursday night elsewhere.
    expect(isOpenAt(office, new Date("2026-10-23T01:00:00Z"))).toBe(true);
  });

  it("handles windows past midnight, 24 hours, and unknown hours", () => {
    const bar: OpeningHours = { fri: [["18:00", "02:00"]] };
    expect(isOpenAt(bar, manila("2026-10-23T23:30:00"))).toBe(true);
    expect(isOpenAt(bar, manila("2026-10-24T01:30:00"))).toBe(true);
    expect(isOpenAt(bar, manila("2026-10-24T02:00:00"))).toBe(false);
    expect(isOpenAt({ fri: [["00:00", "24:00"]] }, manila("2026-10-23T23:59:00"))).toBe(true);
    expect(isOpenAt(null, manila("2026-10-23T10:00:00"))).toBeNull();
  });
});

describe("nextOpenWindow / openStatus", () => {
  it("finds the next opening", () => {
    expect(nextOpenWindow(office, manila("2026-10-23T06:00:00"))).toEqual({ day: "fri", opens: "08:00", inDays: 0 });
    expect(nextOpenWindow(office, manila("2026-10-23T18:00:00"))).toEqual({ day: "mon", opens: "08:00", inDays: 3 });
    expect(nextOpenWindow({}, manila("2026-10-23T18:00:00"))).toBeNull();
  });

  it("labels the status", () => {
    expect(openStatus(office, manila("2026-10-23T10:00:00"))).toEqual({ state: "open", label: "Open now" });
    expect(openStatus(office, manila("2026-10-22T18:00:00")).label).toBe("Closed · opens tomorrow 8:00 AM");
    expect(openStatus(office, manila("2026-10-23T18:00:00")).label).toBe("Closed · opens Mon 8:00 AM");
    expect(openStatus(null).state).toBe("unknown");
  });
});

describe("parseHoursText", () => {
  it("reads ranges, lists, split days and closed days", () => {
    const parsed = parseHoursText("Mon-Fri 08:00-17:00; Sat 9:00-12:00, 13:00-17:00; Sun closed");
    expect(parsed).toEqual({
      ok: true,
      hours: { ...office, sat: [["09:00", "12:00"], ["13:00", "17:00"]] },
    });
    expect(parseHoursText("Daily 06:00-18:00").ok && Object.keys((parseHoursText("Daily 06:00-18:00") as { hours: object }).hours)).toHaveLength(7);
    expect(parseHoursText("24/7")).toMatchObject({ ok: true });
    expect(parseHoursText("")).toEqual({ ok: true, hours: null });
    expect(parseHoursText("Fri-Mon 10:00-14:00").ok).toBe(true);
  });

  it("rejects things it cannot read", () => {
    for (const bad of ["Someday 08:00-17:00", "Mon 25:00-26:00", "Mon 08:00", "Mon 08:00-08:00", "nonsense"]) {
      expect(parseHoursText(bad).ok).toBe(false);
    }
  });

  it("round-trips through hoursToText (property)", () => {
    const time = fc.tuple(fc.integer({ min: 0, max: 22 }), fc.integer({ min: 0, max: 59 })).map(([h, m]) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    fc.assert(
      fc.property(fc.uniqueArray(fc.constantFrom("mon", "tue", "wed", "thu", "fri", "sat", "sun"), { minLength: 1 }), time, (days, open) => {
        const [h, m] = open.split(":").map(Number);
        const close = `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        const hours = Object.fromEntries(days.map((d) => [d, [[open, close]]])) as OpeningHours;
        const parsed = parseHoursText(hoursToText(hours));
        expect(parsed).toEqual({ ok: true, hours });
      }),
    );
  });
});

describe("parseOpeningHours / describeHours", () => {
  it("validates stored JSON", () => {
    expect(parseOpeningHours({ mon: [["08:00", "17:00"]] })).toEqual({ mon: [["08:00", "17:00"]] });
    expect(parseOpeningHours({ funday: [["08:00", "17:00"]] })).toBeNull();
    expect(parseOpeningHours({ mon: [["8am", "5pm"]] })).toBeNull();
    expect(parseOpeningHours(null)).toBeNull();
    expect(parseOpeningHours([])).toBeNull();
  });

  it("describes each day", () => {
    const lines = describeHours({ ...office, sun: [["00:00", "24:00"]] });
    expect(lines[0]).toEqual({ day: "Mon", text: "8:00 AM – 5:00 PM" });
    expect(lines[5]).toEqual({ day: "Sat", text: "Closed" });
    expect(lines[6]).toEqual({ day: "Sun", text: "Open 24 hours" });
  });
});
