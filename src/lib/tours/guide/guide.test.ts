import { formatPeso } from "@/lib/money";
import { estimateTripCost } from "@/lib/tours/guide/costs";
import { faresBetween, fareLabel, minutesLabel, namesMatch, toFare, validateFare, type Fare } from "@/lib/tours/guide/fares";
import { mapsDirectionsUrl, mapsPlaceUrl, mapsQuery } from "@/lib/tours/guide/maps";
import { distanceToSegmentM, priceLabel, sortByDistance, toGuidePlace, validateGuidePlace } from "@/lib/tours/guide/places";

const fare = (over: Partial<Fare>): Fare => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  mode: "bus",
  from_name: "Manila (PITX)",
  to_name: "Daet",
  board_place_id: null,
  fare_min: 801,
  fare_max: 801,
  fare_per: "person",
  minutes_min: 540,
  minutes_max: 720,
  schedule_note: null,
  source: "test",
  checked_on: "2026-10-29",
  verified: false,
  is_active: true,
  ...over,
});

const FARES: Fare[] = [
  fare({ id: "bus" }),
  fare({ id: "trike", mode: "tricycle", from_name: "Daet town center", to_name: "Bagasbas", fare_min: 30, fare_max: 30, minutes_min: 10, minutes_max: 15 }),
  fare({ id: "boat", mode: "boat", from_name: "Paracale port", to_name: "Calaguas", fare_min: 3000, fare_max: 7000, fare_per: "boat", minutes_min: 120, minutes_max: 150 }),
  fare({ id: "vinzons", mode: "boat", from_name: "Vinzons", to_name: "Calaguas", fare_min: null, fare_max: null, fare_per: "boat", minutes_min: 90, minutes_max: 120 }),
  fare({ id: "off", mode: "van", from_name: "Naga", to_name: "Daet", is_active: false }),
];

describe("Google Maps links", () => {
  it("builds directions from the phone's location to a pin", () => {
    const url = mapsDirectionsUrl({ name: "Bagasbas", point: { lat: 14.1316, lng: 122.9851 } });
    expect(url).toBe("https://www.google.com/maps/dir/?api=1&destination=14.131600%2C122.985100&travelmode=driving");
    expect(url).not.toContain("origin=");
  });

  it("searches by name when there is no confirmed pin", () => {
    expect(mapsQuery({ name: "Leo's Cuisine", area: "Daet" })).toBe("Leo's Cuisine, Daet, Camarines Norte");
    expect(mapsPlaceUrl({ name: "Hotel Formosa" })).toBe("https://www.google.com/maps/search/?api=1&query=Hotel+Formosa%2C+Daet%2C+Camarines+Norte");
    expect(mapsDirectionsUrl({ name: "Dolor Hotel" }, "walking")).toContain("travelmode=walking");
  });

  it("stays within the 2,048-character limit", () => {
    expect(mapsPlaceUrl({ name: "x".repeat(5000) }).length).toBeLessThanOrEqual(2048);
  });
});

describe("guide places", () => {
  it("normalises numeric strings and arrays", () => {
    const p = toGuidePlace({ name: "A", latitude: "14.1", longitude: "122.9", price_min: "650", price_max: null, specialties: null, tags: ["x"], opening_hours: null });
    expect(p).toMatchObject({ latitude: 14.1, longitude: 122.9, price_min: 650, price_max: null, specialties: [], tags: ["x"] });
  });

  it("labels prices", () => {
    expect(priceLabel({ price_min: 650, price_max: null, price_unit: "night" }, formatPeso)).toBe("from ₱650.00 per night");
    expect(priceLabel({ price_min: 150, price_max: 300, price_unit: "meal" }, formatPeso)).toBe("₱150.00–₱300.00 per meal");
    expect(priceLabel({ price_min: null, price_max: null, price_unit: null }, formatPeso)).toBeNull();
  });

  it("sorts nearest first and puts places without pins last", () => {
    const sorted = sortByDistance(
      [
        { name: "No pin", latitude: null, longitude: null },
        { name: "Far", latitude: 14.3, longitude: 122.8 },
        { name: "Near", latitude: 14.13, longitude: 122.98 },
      ],
      { lat: 14.1316, lng: 122.9851 },
    );
    expect(sorted.map((p) => p.name)).toEqual(["Near", "Far", "No pin"]);
    expect(sorted[2].distanceM).toBeNull();
  });

  it("measures distance from a route", () => {
    const a = { lat: 14.1122, lng: 122.9553 };
    const b = { lat: 14.1316, lng: 122.9851 };
    expect(distanceToSegmentM({ lat: 14.1219, lng: 122.9702 }, a, b)).toBeLessThan(50);
    expect(distanceToSegmentM({ lat: 14.2, lng: 122.8 }, a, b)).toBeGreaterThan(5000);
  });

  it("validates the admin form", () => {
    const ok = validateGuidePlace({ kind: "eatery", name: "Leo's Cuisine", priceMin: "₱150", priceMax: "300", priceUnit: "meal", specialties: "Bicol express; sinantolan", source: "Wikivoyage" }, "2026-10-29");
    expect(ok.ok && ok.data).toMatchObject({ slug: "leo-s-cuisine", price_min: 150, price_max: 300, specialties: ["Bicol express", "sinantolan"], checked_on: "2026-10-29" });
    const bad = validateGuidePlace({ kind: "bar", name: "X", priceMin: "200", priceMax: "100", source: "" }, "2026-10-29");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(["kind", "name", "priceMax", "priceUnit", "source"]);
  });
});

describe("fares", () => {
  it("matches what people type to place names", () => {
    expect(namesMatch("manila", "Manila (PITX)")).toBe(true);
    expect(namesMatch("Daet town", "Daet town center")).toBe(true);
    expect(namesMatch("paracale", "Paracale port")).toBe(true);
    expect(namesMatch("naga", "Daet")).toBe(false);
  });

  it("finds direct rides in either direction, skipping inactive rows", () => {
    expect(faresBetween(FARES, "Bagasbas", "Daet").map((r) => r.legs.map((l) => [l.id, l.reversed]))).toEqual([[["trike", true]]]);
    expect(faresBetween(FARES, "Naga", "Daet")).toEqual([]);
  });

  it("joins two legs through a shared stop", () => {
    const routes = faresBetween(FARES, "Manila", "Bagasbas");
    expect(routes).toHaveLength(1);
    expect(routes[0].legs.map((l) => l.id)).toEqual(["bus", "trike"]);
    expect([routes[0].minutesMin, routes[0].minutesMax]).toEqual([550, 735]);
  });

  it("lists every way in when no start is given", () => {
    expect(faresBetween(FARES, null, "Calaguas").map((r) => r.legs[0].from_name)).toEqual(["Paracale port", "Vinzons"]);
  });

  it("labels fares and times", () => {
    expect(fareLabel(FARES[2], formatPeso)).toBe("₱3,000.00–₱7,000.00 per boat");
    expect(fareLabel(FARES[3], formatPeso)).toBeNull();
    expect(minutesLabel(540, 720)).toBe("9–12 h");
    expect(minutesLabel(10, 15)).toBe("10 min to 15 min");
    expect(minutesLabel(90, null)).toBe("1 h 30 min");
  });

  it("normalises rows and validates the admin form", () => {
    expect(toFare({ fare_min: "30", fare_max: "30", minutes_min: "10", minutes_max: null })).toMatchObject({ fare_min: 30, minutes_max: null });
    const ok = validateFare({ mode: "tricycle", fromName: "Daet", toName: "Bagasbas", fareMin: "30", source: "Tourism Office" }, "2026-10-29");
    expect(ok.ok && ok.data).toMatchObject({ fare_min: 30, fare_max: 30, fare_per: "person" });
    expect(validateFare({ mode: "rocket", fromName: "D", toName: "", source: "x" }, "2026-10-29").ok).toBe(false);
  });
});

describe("trip cost estimate", () => {
  const legs = faresBetween(FARES, "Manila", "Bagasbas")[0].legs;
  const base = {
    people: 2,
    nights: 1,
    style: "budget" as const,
    legs,
    eateries: [
      { name: "Cheap eats", price_min: 120, price_max: 200, price_unit: "meal" as const, source: "a" },
      { name: "Fancy", price_min: 400, price_max: 700, price_unit: "meal" as const, source: "b" },
    ],
    lodgings: [{ name: "Dolor Hotel", price_min: 650, price_max: null, price_unit: "night" as const, source: "c" }],
    format: formatPeso,
  };

  it("adds transport both ways, meals, a room and a 10% buffer", () => {
    const e = estimateTripCost(base);
    const amounts = Object.fromEntries(e.lines.map((l) => [l.label, [l.min, l.max]]));
    expect(amounts["Bus: Manila (PITX) to Daet"]).toEqual([3204, 3204]);
    expect(amounts["Tricycle: Daet town center to Bagasbas"]).toEqual([120, 120]);
    expect(amounts["Meals"]).toEqual([1440, 2400]);
    expect(amounts["Stay: Dolor Hotel"]).toEqual([650, 650]);
    expect(amounts["Extra for the unexpected (10%)"]).toEqual([541, 637]);
    expect([e.totalMin, e.totalMax]).toEqual([5955, 7011]);
    expect([e.perPersonMin, e.perPersonMax]).toEqual([2978, 3506]);
    expect(e.unknown).toEqual([]);
  });

  it("picks the price band for the travel style", () => {
    const comfort = estimateTripCost({ ...base, style: "comfort" });
    expect(comfort.lines.find((l) => l.label === "Meals")).toMatchObject({ min: 4800, max: 8400 });
  });

  it("shares a hired boat and never invents a missing price", () => {
    const boat = faresBetween(FARES, "Paracale", "Calaguas")[0].legs;
    const noBoatFare = faresBetween(FARES, "Vinzons", "Calaguas")[0].legs;
    const e = estimateTripCost({ ...base, legs: [...boat, ...noBoatFare], eateries: [], lodgings: [], people: 6 });
    expect(e.lines.find((l) => l.label.startsWith("Boat: Paracale"))).toMatchObject({ min: 6000, max: 14000 });
    expect(e.lines.find((l) => l.label.startsWith("Boat: Vinzons"))).toMatchObject({ min: null, max: null });
    expect(e.unknown).toEqual(["Boat: Vinzons to Calaguas", "Meals", "Stay"]);
  });

  it("includes the tour price and entrance fees, and day trips need no room", () => {
    const e = estimateTripCost({ ...base, legs: [], nights: 0, tour: { title: "Calaguas day trip", price: 1500, perPerson: true }, entranceFees: [{ name: "Heritage Center", fee: 50 }, { name: "Free park", fee: 0 }] });
    expect(e.lines.map((l) => l.label)).toEqual(["Tour: Calaguas day trip", "Entrance: Heritage Center", "Meals", "Extra for the unexpected (10%)"]);
    expect(e.lines[0]).toMatchObject({ min: 3000, max: 3000 });
  });
});
