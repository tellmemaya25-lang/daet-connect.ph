import { departureText, meetingTimeProblem, needsMeetingTime } from "@/lib/tours/meeting-time";

const hourTour = (hours = 8) => ({ duration_type: "hours", duration_value: hours });
const dayTour = (days = 1) => ({ duration_type: "days", duration_value: days });

describe("needsMeetingTime", () => {
  it("asks hour tours only, because a day tour really does take the day", () => {
    expect(needsMeetingTime(hourTour())).toBe(true);
    expect(needsMeetingTime(dayTour())).toBe(false);
    expect(needsMeetingTime(dayTour(3))).toBe(false);
    expect(needsMeetingTime({ duration_type: null })).toBe(false);
  });
});

describe("meetingTimeProblem", () => {
  it("stays quiet once a time is set", () => {
    expect(meetingTimeProblem(hourTour(), "08:00")).toBeNull();
    expect(meetingTimeProblem(hourTour(), "06:30")).toBeNull();
  });

  it("never asks a day tour for a time", () => {
    expect(meetingTimeProblem(dayTour(), null)).toBeNull();
    expect(meetingTimeProblem(dayTour(), "")).toBeNull();
  });

  it("explains what the guest loses when an hour tour has no time", () => {
    const problem = meetingTimeProblem(hourTour(8), null)!;
    expect(problem).toContain("8-hour tour");
    expect(problem).toContain("all day");
    // The consequence, in the operator's terms, is the point of the message.
    expect(problem).toContain("cannot book any other tour on that date");
    expect(meetingTimeProblem(hourTour(8), "")).toBe(problem);
    expect(meetingTimeProblem(hourTour(8), "   ")).toBe(problem);
  });

  it("describes a tour of unknown length without inventing a number", () => {
    expect(meetingTimeProblem({ duration_type: "hours", duration_value: null }, null)).toContain("hour tour");
    expect(meetingTimeProblem(hourTour(0), null)).toContain("hour tour");
  });
});

describe("departureText", () => {
  it("reads a time the way guests do", () => {
    expect(departureText("08:00")).toBe("8:00 AM");
    expect(departureText("08:00:00")).toBe("8:00 AM");
    expect(departureText("06:30")).toBe("6:30 AM");
    expect(departureText("13:05")).toBe("1:05 PM");
    expect(departureText("00:30")).toBe("12:30 AM");
    expect(departureText("12:00")).toBe("12:00 PM");
  });

  it("falls back to 'all day' rather than showing a broken time", () => {
    expect(departureText(null)).toBe("all day");
    expect(departureText("")).toBe("all day");
    expect(departureText("nonsense")).toBe("all day");
  });
});
