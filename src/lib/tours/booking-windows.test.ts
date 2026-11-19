import {
  TRANSFER_BUFFER_MIN,
  bookingWindow,
  bookingWindowText,
  clashMessage,
  dateKeyToDays,
  daysToDateKey,
  dayMinutesTaken,
  dayPlan,
  findTouristClash,
  freeTimeText,
  occupiesDate,
  occupiedDayOffsets,
  shortDate,
  tourSpanDays,
  windowText,
  windowWithBuffer,
  windowsOverlap,
  type OccupiedBooking,
} from "@/lib/tours/booking-windows";

const hourTour = (meeting: string | null, hours: number) => ({ duration_type: "hours", duration_value: hours, meeting_time: meeting });
const dayTrip = (days: number, meeting: string | null = "06:00:00") => ({ duration_type: "days", duration_value: days, meeting_time: meeting });

const booking = (over: Partial<OccupiedBooking>): OccupiedBooking => ({
  id: "b1",
  package_id: "p1",
  tour_date: "2026-11-21",
  title: "A tour",
  status: "confirmed",
  ...over,
});

describe("tour span", () => {
  it("counts days only for day tours", () => {
    expect(tourSpanDays(hourTour("09:00", 8))).toBe(1);
    expect(tourSpanDays(dayTrip(1))).toBe(1);
    expect(tourSpanDays(dayTrip(3))).toBe(3);
    expect(tourSpanDays({ duration_type: "days", duration_value: null })).toBe(1);
    expect(tourSpanDays({ duration_type: "days", duration_value: 0 })).toBe(1);
  });

  it("holds consecutive dates, starting on the tour date", () => {
    expect(occupiedDayOffsets(dayTrip(3))).toEqual([0, 1, 2]);
    expect(occupiesDate(dayTrip(3), "2026-11-21", "2026-11-21")).toBe(true);
    expect(occupiesDate(dayTrip(3), "2026-11-21", "2026-11-23")).toBe(true);
    expect(occupiesDate(dayTrip(3), "2026-11-21", "2026-11-24")).toBe(false);
    expect(occupiesDate(dayTrip(3), "2026-11-21", "2026-11-20")).toBe(false);
    expect(occupiesDate(hourTour("09:00", 2), "2026-11-21", "2026-11-22")).toBe(false);
  });
});

describe("bookingWindow", () => {
  it("uses the package window for a one-day tour", () => {
    expect(bookingWindow(hourTour("09:00", 1))).toEqual([540, 600]);
    expect(bookingWindow(hourTour(null, 8))).toEqual([0, 1440]);
  });

  it("starts a multi-day trip at its meeting time, then holds later days whole", () => {
    // "Calaguas 3 days 2 nights" leaves at 06:00 and is gone for the rest of it.
    expect(bookingWindow(dayTrip(3), 1)).toEqual([360, 1440]);
    expect(bookingWindow(dayTrip(3), 2)).toEqual([0, 1440]);
    expect(bookingWindow(dayTrip(3), 3)).toEqual([0, 1440]);
  });

  it("starts at midnight when a multi-day trip has no meeting time", () => {
    expect(bookingWindow(dayTrip(2, null), 1)).toEqual([0, 1440]);
  });
});

describe("overlap arithmetic", () => {
  it("is half-open, so touching windows do not overlap", () => {
    expect(windowsOverlap([540, 600], [600, 660])).toBe(false);
    expect(windowsOverlap([540, 601], [600, 660])).toBe(true);
  });

  it("widens by the buffer and stops at the edges of the day", () => {
    expect(TRANSFER_BUFFER_MIN).toBe(45);
    expect(windowWithBuffer([540, 600])).toEqual([495, 645]);
    expect(windowWithBuffer([0, 1440])).toEqual([0, 1440]);
    expect(windowWithBuffer([10, 20])).toEqual([0, 65]);
    expect(windowWithBuffer([540, 600], 0)).toEqual([540, 600]);
  });

  it("reads a window the way the page says it", () => {
    expect(windowText([540, 600])).toBe("9:00 AM – 10:00 AM");
    expect(windowText([360, 1440])).toBe("6:00 AM – midnight");
    expect(windowText([0, 1440])).toBe("all day");
    expect(bookingWindowText(hourTour("13:05", 1))).toBe("1:05 PM – 2:05 PM");
  });
});

describe("date keys", () => {
  it("converts both ways without the machine's time zone", () => {
    const days = dateKeyToDays("2026-11-21")!;
    expect(daysToDateKey(days)).toBe("2026-11-21");
    expect(dateKeyToDays("nope")).toBeNull();
    expect(shortDate("2026-11-21")).toBe("21 Nov");
  });
});

describe("findTouristClash", () => {
  it("catches a short tour booked inside a whole-day tour", () => {
    // The production case: an 8-hour tour with no meeting time holds the whole
    // day, and the 09:00 Rizal walk was still bookable inside it.
    const surf = booking({ title: "Bagasbas Beach Surf & Chill", duration_type: "hours", duration_value: 8, meeting_time: null });
    const clash = findTouristClash(hourTour("09:00", 1), "2026-11-21", [surf]);
    expect(clash?.booking.title).toBe("Bagasbas Beach Surf & Chill");
    expect(clash?.window).toEqual([0, 1440]);
    expect(clashMessage(clash!)).toBe(
      "This tour overlaps your booking for Bagasbas Beach Surf & Chill (all day) on 21 Nov. " +
        "Pick another date, or cancel that booking first.",
    );
  });

  it("allows two short tours apart by more than the buffer", () => {
    const morning = booking({ id: "a", title: "Rizal Monument", ...hourTour("09:00", 1) });
    // 9:00-10:00, buffered to 8:15-10:45; 14:00-15:00 is clear.
    expect(findTouristClash(hourTour("14:00", 1), "2026-11-21", [morning])).toBeNull();
  });

  it("blocks back-to-back tours closer than the transfer buffer", () => {
    const morning = booking({ id: "a", title: "Heritage Walk", ...hourTour("09:00", 1) });
    // 9:00-10:00 ends at 10:00; the 10:00 tour starts inside the buffer.
    const clash = findTouristClash(hourTour("10:00", 1), "2026-11-21", [morning]);
    expect(clash?.booking.id).toBe("a");
  });

  it("ignores bookings on other dates and inactive ones", () => {
    const otherDay = booking({ id: "a", tour_date: "2026-11-22", ...hourTour("09:00", 1) });
    expect(findTouristClash(hourTour("09:00", 1), "2026-11-21", [otherDay])).toBeNull();

    const cancelled = booking({ id: "b", status: "cancelled", ...hourTour("09:00", 1) });
    expect(findTouristClash(hourTour("09:00", 1), "2026-11-21", [cancelled])).toBeNull();
  });

  it("honours the exclusion when a booking is being changed", () => {
    const itself = booking({ id: "a", ...hourTour("09:00", 1) });
    expect(findTouristClash(hourTour("09:00", 1), "2026-11-21", [itself])).not.toBeNull();
    expect(findTouristClash(hourTour("09:00", 1), "2026-11-21", [itself], "a")).toBeNull();
  });

  it("catches a tour booked during a multi-day trip already underway", () => {
    const camping = booking({ title: "Calaguas camping, 3 days 2 nights", ...dayTrip(3) });
    // The trip starts on the 21st, so the 22nd is day 2 — held whole.
    const clash = findTouristClash(hourTour("14:00", 1), "2026-11-22", [camping]);
    expect(clash?.booking.title).toBe("Calaguas camping, 3 days 2 nights");
    expect(clash?.date).toBe("2026-11-22");
    expect(clash?.sameStartDate).toBe(false);
    expect(clash?.window).toEqual([0, 1440]);
  });

  it("catches a multi-day trip that would run into a tour already booked", () => {
    const rafting = booking({ id: "b", tour_date: "2026-11-22", title: "Rizal Monument", ...hourTour("09:00", 1) });
    // A new 3-day trip from the 21st occupies the 21st-23rd, so it lands on the 22nd.
    const clash = findTouristClash(dayTrip(3), "2026-11-21", [rafting]);
    expect(clash?.booking.id).toBe("b");
    expect(clash?.date).toBe("2026-11-22");
  });

  it("returns the earliest clash so the message is stable", () => {
    const first = booking({ id: "a", tour_date: "2026-11-21", title: "First", ...hourTour(null, 8) });
    const second = booking({ id: "b", tour_date: "2026-11-21", title: "Second", ...hourTour("09:00", 2) });
    expect(findTouristClash(hourTour("09:00", 1), "2026-11-21", [second, first])?.booking.id).toBe("a");
  });

  it("says nothing for a date it cannot read", () => {
    expect(findTouristClash(hourTour("09:00", 1), "21/11/2026", [booking({ ...hourTour("09:00", 1) })])).toBeNull();
  });
});

describe("dayPlan", () => {
  const surf = booking({ id: "s", title: "Bagasbas Surf & Chill", tour_date: "2026-11-21", ...hourTour(null, 8) });
  const rizal = booking({ id: "r", title: "First Jose Rizal Monument", tour_date: "2026-11-21", ...hourTour("09:00", 1) });

  it("lists the tourist's tours on that date in clock order", () => {
    const entries = dayPlan("2026-11-21", [rizal, surf]);
    expect(entries.map((e) => e.booking.id)).toEqual(["s", "r"]);
    expect(entries[0].window).toEqual([0, 1440]);
    expect(entries[1].window).toEqual([540, 600]);
    expect(entries.every((e) => e.startsHere)).toBe(true);
  });

  it("shows a multi-day trip that is only passing through, marked as not starting here", () => {
    const camping = booking({ id: "c", title: "Calaguas camping", tour_date: "2026-11-21", ...dayTrip(3) });
    const entries = dayPlan("2026-11-22", [camping]);
    expect(entries).toHaveLength(1);
    expect(entries[0].startsHere).toBe(false);
    expect(entries[0].window).toEqual([0, 1440]);
  });

  it("leaves out other dates and inactive bookings", () => {
    const elsewhere = booking({ id: "x", tour_date: "2026-11-25", ...hourTour("09:00", 1) });
    const cancelled = booking({ id: "y", status: "cancelled", ...hourTour("09:00", 1) });
    expect(dayPlan("2026-11-21", [elsewhere, cancelled])).toEqual([]);
    expect(dayPlan("not-a-date", [rizal])).toEqual([]);
  });

  it("excludes the booking being changed", () => {
    expect(dayPlan("2026-11-21", [rizal], "r")).toEqual([]);
  });
});

describe("free time", () => {
  const entry = (window: [number, number], id = "x") => ({
    booking: booking({ id, title: id }),
    window,
    startsHere: true,
  });

  it("says when nothing is left", () => {
    expect(freeTimeText([entry([0, 1440])])).toBe("no time left that day");
    expect(dayMinutesTaken([entry([0, 1440])])).toBe(1440);
  });

  it("does not double-count a short tour inside a whole-day one", () => {
    // The production case: an 8-hour all-day tour plus a 1-hour walk inside it.
    expect(dayMinutesTaken([entry([0, 1440], "a"), entry([540, 600], "b")])).toBe(1440);
    expect(freeTimeText([entry([0, 1440], "a"), entry([540, 600], "b")])).toBe("no time left that day");
  });

  it("merges overlapping and touching windows", () => {
    expect(dayMinutesTaken([entry([540, 600]), entry([600, 660])])).toBe(120);
    expect(dayMinutesTaken([entry([540, 660]), entry([600, 720])])).toBe(180);
  });

  it("adds up separate windows", () => {
    expect(dayMinutesTaken([entry([540, 600]), entry([840, 900])])).toBe(120);
    expect(freeTimeText([entry([540, 600]), entry([840, 900])])).toBe("22 hours free");
  });

  it("reads free time in hours and minutes", () => {
    expect(freeTimeText([entry([540, 600])])).toBe("23 hours free");
    expect(freeTimeText([entry([0, 1380])])).toBe("1 hour free");
    expect(freeTimeText([entry([0, 1415])])).toBe("25 minutes free");
    expect(freeTimeText([entry([0, 1400])])).toBe("40 minutes free");
    expect(freeTimeText([entry([0, 1395])])).toBe("45 minutes free");
    expect(dayMinutesTaken([])).toBe(0);
    expect(freeTimeText([])).toBe("24 hours free");
  });
});
