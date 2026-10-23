import { eventDayRange, toursDuringEvent, type AvailabilityWithPackage } from "@/lib/tours/event-tours";

const bagasbas = { lat: 14.131583, lng: 122.985083 };
const row = (date: string, pkg: Partial<NonNullable<AvailabilityWithPackage["tours_packages"]>> & { id: string }, seats = 5): AvailabilityWithPackage => ({
  available_date: date,
  capacity_total: 10,
  capacity_booked: 10 - seats,
  tours_packages: { title: pkg.id, location_name: null, cover_image_url: null, status: "published", tours_package_stops: [], ...pkg },
});

describe("eventDayRange", () => {
  it("uses Manila dates", () => {
    expect(eventDayRange({ starts_at: "2026-06-14T16:00:00Z", ends_at: "2026-06-24T15:59:00Z" })).toEqual({ from: "2026-06-15", to: "2026-06-24" });
  });
});

describe("toursDuringEvent", () => {
  const range = { from: "2026-06-15", to: "2026-06-24" };
  it("keeps open, published dates inside the event and groups them per package", () => {
    const tours = toursDuringEvent(
      [
        row("2026-06-16", { id: "a" }),
        row("2026-06-15", { id: "a" }),
        row("2026-06-14", { id: "b" }), // before the event
        row("2026-06-25", { id: "c" }), // after
        row("2026-06-18", { id: "d" }, 0), // full
        row("2026-06-18", { id: "e", status: "draft" }),
      ],
      range,
      "2026-06-01",
      null,
    );
    expect(tours.map((t) => [t.id, t.dates])).toEqual([["a", ["2026-06-15", "2026-06-16"]]]);
  });
  it("skips days already past", () => {
    expect(toursDuringEvent([row("2026-06-15", { id: "a" }), row("2026-06-20", { id: "a" })], range, "2026-06-18", null)[0].dates).toEqual(["2026-06-20"]);
  });
  it("puts packages with a stop near the attraction first, closest first", () => {
    const tours = toursDuringEvent(
      [
        row("2026-06-15", { id: "far", tours_package_stops: [{ latitude: "14.40", longitude: "122.50" }] }),
        row("2026-06-20", { id: "near", tours_package_stops: [{ latitude: "14.1320", longitude: "122.9850" }] }),
        row("2026-06-21", { id: "nearer", tours_package_stops: [{ latitude: 14.1316, longitude: 122.9851 }, { latitude: null, longitude: null }] }),
        row("2026-06-16", { id: "unmapped" }),
      ],
      range,
      "2026-06-01",
      bagasbas,
    );
    expect(tours.map((t) => t.id)).toEqual(["nearer", "near", "far", "unmapped"]);
    expect(tours[0].nearestMeters).toBeLessThan(50);
    expect(tours[3].nearestMeters).toBeNull();
  });
});
