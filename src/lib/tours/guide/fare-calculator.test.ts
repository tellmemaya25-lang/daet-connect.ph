import { faresBetween, type Fare } from "@/lib/tours/guide/fares";
import { farePlaces, meetingFarePlace, parsePeople, pickPlace, quoteRoute } from "@/lib/tours/guide/fare-calculator";

const fare = (over: Partial<Fare>): Fare => ({
  id: Math.random().toString(36),
  mode: "tricycle",
  from_name: "Daet",
  to_name: "Bagasbas",
  board_place_id: null,
  fare_min: 30,
  fare_max: 50,
  fare_per: "person",
  minutes_min: 10,
  minutes_max: 15,
  schedule_note: null,
  source: "Tourism Office",
  checked_on: "2026-10-01",
  verified: true,
  is_active: true,
  ...over,
});

const FARES = [
  fare({ id: "bus", mode: "bus", from_name: "Manila (Cubao)", to_name: "Daet", fare_min: 800, fare_max: 900, minutes_min: 480, minutes_max: 540, checked_on: "2026-09-01" }),
  fare({ id: "tri", mode: "tricycle", from_name: "Daet", to_name: "Bagasbas", fare_min: 150, fare_max: 200, fare_per: "trip" }),
  fare({ id: "boat", mode: "boat", from_name: "Vinzons", to_name: "Calaguas", fare_min: 3000, fare_max: null, fare_per: "boat" }),
  fare({ id: "van", mode: "van", from_name: "Daet", to_name: "Vinzons", fare_min: null, fare_max: null }),
  fare({ id: "old", from_name: "Daet", to_name: "Old place", is_active: false }),
];

describe("fare calculator", () => {
  it("multiplies per-person legs by the group and shares per-trip legs", () => {
    const [route] = faresBetween(FARES, "Manila (Cubao)", "Bagasbas");
    const q = quoteRoute(route, 3, false);
    expect(q.legs.map((l) => l.mode)).toEqual(["bus", "tricycle"]);
    expect(q.legs[0]).toMatchObject({ groupMin: 2400, groupMax: 2700 });
    expect(q.legs[1]).toMatchObject({ groupMin: 150, groupMax: 200 });
    expect(q).toMatchObject({ totalMin: 2550, totalMax: 2900, perPersonMin: 850, perPersonMax: 966.67, partial: false, checkedOn: "2026-09-01" });
  });

  it("doubles a round trip", () => {
    const [route] = faresBetween(FARES, "Daet", "Bagasbas");
    expect(quoteRoute(route, 2, true)).toMatchObject({ totalMin: 300, totalMax: 400, perPersonMin: 150 });
  });

  it("leaves unknown fares out and says the total is a floor", () => {
    const [route] = faresBetween(FARES, "Daet", "Calaguas");
    const q = quoteRoute(route, 4, false);
    expect(q.unknown).toEqual(["Van (UV Express): Daet to Vinzons"]);
    expect(q.partial).toBe(true);
    expect(q.totalMin).toBe(3000);
    expect(q.totalMax).toBe(3000);
  });

  it("lists active places and only accepts listed ones", () => {
    const places = farePlaces(FARES);
    expect(places).toContain("Calaguas");
    expect(places).not.toContain("Old place");
    expect(pickPlace("Daet", places)).toBe("Daet");
    expect(pickPlace("Mars", places)).toBe("");
    expect(parsePeople("4")).toBe(4);
    expect(parsePeople("0")).toBe(1);
    expect(parsePeople("99")).toBe(1);
    expect(parsePeople(["2"])).toBe(2);
  });
});

describe("meeting point", () => {
  const places = ["Bagasbas", "Daet", "Manila (Cubao)", "Vinzons"];
  it("prices the ride to the meeting point when the fare table names it", () => {
    expect(meetingFarePlace("Bagasbas Beach", "Daet", places)).toEqual({ place: "Bagasbas", exact: true });
  });
  it("falls back to the tour's area, then to Daet, and says it is near", () => {
    expect(meetingFarePlace("Kalmado office, Vinzons Ave.", "Vinzons", places)).toEqual({ place: "Vinzons", exact: false });
    expect(meetingFarePlace("Plaza Pakitokit", "Daet town center", places)).toEqual({ place: "Daet", exact: false });
    expect(meetingFarePlace("Somewhere", "Somewhere", ["Manila (Cubao)"])).toBeNull();
  });
});
