import { clockText, coversTour, hoursText, parseHours, shortHours, toHHMM, tourWindow } from "@/lib/tours/guide-hours";

describe("parseHours", () => {
  it("accepts all day, or a start before an end", () => {
    expect(parseHours("", "")).toEqual({ ok: true, start: null, end: null });
    expect(parseHours("08:00", "11:30")).toEqual({ ok: true, start: "08:00", end: "11:30" });
    expect(parseHours("08:00:00", "09:00:00")).toEqual({ ok: true, start: "08:00", end: "09:00" });
  });
  it("rejects half-filled, reversed, too short or bad times", () => {
    expect(parseHours("08:00", "").ok).toBe(false);
    expect(parseHours("11:00", "08:00").ok).toBe(false);
    expect(parseHours("08:00", "08:15").ok).toBe(false);
    expect(parseHours("25:00", "26:00").ok).toBe(false);
  });
});

describe("text", () => {
  it("reads times in 12-hour form", () => {
    expect(clockText("00:30")).toBe("12:30 AM");
    expect(clockText("13:05")).toBe("1:05 PM");
    expect(hoursText("08:00", "17:00")).toBe("8:00 AM – 5:00 PM");
    expect(hoursText(null, null)).toBe("All day");
    expect(shortHours("08:00", "11:30")).toBe("8–11:30");
    expect(shortHours(null, null)).toBeNull();
    expect(toHHMM("nope")).toBeNull();
  });
});

describe("tour windows", () => {
  it("uses the meeting time for hour tours, the whole day otherwise", () => {
    expect(tourWindow({ duration_type: "hours", duration_value: 2, meeting_time: "08:30:00" })).toEqual([510, 630]);
    expect(tourWindow({ duration_type: "hours", duration_value: 1.5, meeting_time: "23:00" })).toEqual([1380, 1440]);
    expect(tourWindow({ duration_type: "hours", duration_value: 6, meeting_time: null })).toEqual([0, 1440]);
    expect(tourWindow({ duration_type: "days", duration_value: 1, meeting_time: "06:00" })).toEqual([0, 1440]);
  });
  it("checks a tour fits the guide's hours", () => {
    const w = tourWindow({ duration_type: "hours", duration_value: 2, meeting_time: "08:30" });
    expect(coversTour({ available: true, start: "08:00", end: "11:00" }, w)).toBe(true);
    expect(coversTour({ available: true, start: "09:00", end: "11:00" }, w)).toBe(false);
    expect(coversTour({ available: true, start: null, end: null }, [0, 1440])).toBe(true);
    expect(coversTour({ available: false, start: null, end: null }, w)).toBe(false);
    expect(coversTour(undefined, w)).toBe(false);
  });
});
