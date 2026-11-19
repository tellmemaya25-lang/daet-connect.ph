import { doorPickupProblem, parseDoorPickupQuote, toOfficialRates, toPickupVehicles, validateVehicles, vehicleName, vehicleRateLabel, type OfficialRate, type PickupVehicle } from "@/lib/tours/door-pickup";

const vanRate: OfficialRate = { vehicle: "van", baseFee: 0, perKmPerPerson: 2.6, source: "LTFRB UV Express", sourceUrl: null, effectiveOn: "2026-09-28", checkedOn: "2026-11-15" };
const van: PickupVehicle = { id: "v", vehicle: "van", label: null, seats: 3, maxKm: 10, rate: vanRate };

describe("door pickup", () => {
  it("reads the database's Door pickup quote", () => {
    expect(parseDoorPickupQuote({ ok: true, distance_km: 6.9, pickup_fee: 36, tour_total: 1000, grand_total: 1036, vehicle_label: "Van" })).toEqual({ ok: true, km: 6.9, fee: 36, tourTotal: 1000, grandTotal: 1036, vehicleLabel: "Van" });
    expect(parseDoorPickupQuote({ ok: false, reason: "seats", seats: 3, distance_km: 6.9, vehicle_label: "Tricycle" })).toMatchObject({ ok: false, reason: "seats", seats: 3 });
    expect(parseDoorPickupQuote(null)).toMatchObject({ ok: false, reason: "no_vehicle" });
    expect(parseDoorPickupQuote({ ok: true })).toMatchObject({ ok: false });
  });
  it("words a refused quote with the real vehicle name", () => {
    const q = parseDoorPickupQuote({ ok: false, reason: "seats", seats: 3, vehicle_label: "Tricycle" });
    if (q.ok) throw new Error("expected refusal");
    expect(doorPickupProblem(q, 4)).toBe("The tricycle seats 3; you are 4.");
    const far = parseDoorPickupQuote({ ok: false, reason: "too_far", distance_km: 52.1, max_km: 10, vehicle_label: "Van" });
    if (far.ok) throw new Error("expected refusal");
    expect(doorPickupProblem(far, 2)).toBe("That is 52.1 km from the meeting point; this tour picks up within 10 km.");
  });
  it("names and labels vehicles", () => {
    expect(vehicleName(van)).toBe("Van");
    expect(vehicleName({ vehicle: "van", label: "Aircon van" })).toBe("Aircon van");
    expect(vehicleRateLabel(van, (n) => `₱${n}`)).toBe("₱2.6/km per person (official fare), up to 10 km, 3 seats");
  });
  it("reads official rates and keeps only vehicles that have one", () => {
    const rates = toOfficialRates([
      { vehicle: "van", base_fee: "0", per_km_per_person: "2.60", source: "LTFRB UV Express", source_url: null, effective_on: "2026-09-28", checked_on: "2026-11-15" },
      { vehicle: "boat", base_fee: 0, per_km_per_person: 1, source: "x", source_url: null, effective_on: null, checked_on: "2026-11-15" },
    ]);
    expect(Object.keys(rates)).toEqual(["van"]);
    expect(toPickupVehicles([
      { id: "a", vehicle: "van", label: null, seats: "12", max_km: "40.0" },
      { id: "b", vehicle: "tricycle", label: null, seats: 3, max_km: 5 },
      { id: "c", vehicle: "van", label: null, seats: 4, max_km: 10, is_active: false },
    ], rates)).toEqual([{ id: "a", vehicle: "van", label: null, seats: 12, maxKm: 40, rate: vanRate }]);
  });
  it("checks the operator's list: no prices, only vehicles with an official fare", () => {
    const ok = validateVehicles([{ vehicle: "van", label: "", seats: "8", maxKm: "10" }, { vehicle: "", label: "", seats: "", maxKm: "" }], ["van"]);
    expect(ok).toEqual({ ok: true, vehicles: [{ vehicle: "van", label: null, seats: 8, max_km: 10 }] });
    expect(validateVehicles([{ vehicle: "van", label: "", seats: "0", maxKm: "10" }], ["van"])).toMatchObject({ ok: false, error: /seats/ });
    expect(validateVehicles([{ vehicle: "tricycle", label: "", seats: "3", maxKm: "10" }], ["van"])).toMatchObject({ ok: false, error: /no official fare/ });
    expect(validateVehicles([{ vehicle: "boat", label: "", seats: "8", maxKm: "10" }], ["van"])).toMatchObject({ ok: false, error: /type/ });
  });
});

describe("pickup spot shortcuts", () => {
  it("keeps places with a usable pin", () => {
    const { toPickupShortcuts } = jest.requireActual("@/lib/tours/door-pickup") as typeof import("@/lib/tours/door-pickup");
    expect(toPickupShortcuts([
      { id: "1", name: "Plaza", latitude: "14.115928", longitude: "122.955202" },
      { id: "2", name: "No pin", latitude: null, longitude: null },
      { id: "3", name: "Bad", latitude: "999", longitude: "1" },
    ])).toEqual([{ id: "1", name: "Plaza", lat: 14.115928, lng: 122.955202 }]);
  });
});
