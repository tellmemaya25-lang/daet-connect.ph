import { quoteDoorPickup, roadKm, toOfficialRates, toPickupVehicles, validateVehicles, vehicleName, vehicleRateLabel, type OfficialRate, type PickupVehicle } from "@/lib/tours/door-pickup";

const meeting = { lat: 14.1147, lng: 122.9548 };
const bagasbas = { lat: 14.1395, lng: 122.993 };
const vanRate: OfficialRate = { vehicle: "van", baseFee: 0, perKmPerPerson: 2.6, source: "LTFRB UV Express", sourceUrl: null, effectiveOn: "2026-09-28", checkedOn: "2026-11-15" };
const van: PickupVehicle = { id: "v", vehicle: "van", label: null, seats: 3, maxKm: 10, rate: vanRate };

describe("door pickup", () => {
  it("prices the ride from the official fare, per person, as the database does (6.9 km x 2 x ₱2.60 → ₱36)", () => {
    expect(roadKm(bagasbas, meeting)).toBe(6.9);
    expect(quoteDoorPickup(van, bagasbas, meeting, 2)).toEqual({ ok: true, km: 6.9, fee: 36 });
  });
  it("refuses a group that doesn't fit, or a pickup too far away", () => {
    expect(quoteDoorPickup(van, bagasbas, meeting, 4)).toMatchObject({ ok: false, reason: "seats" });
    expect(quoteDoorPickup(van, { lat: 13.6218, lng: 123.1948 }, meeting, 2)).toMatchObject({ ok: false, reason: "too_far" });
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
