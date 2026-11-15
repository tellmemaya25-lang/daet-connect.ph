import { quoteDoorPickup, roadKm, toPickupVehicles, validateVehicles, vehicleName, vehicleRateLabel, type PickupVehicle } from "@/lib/tours/door-pickup";

const meeting = { lat: 14.1147, lng: 122.9548 };
const bagasbas = { lat: 14.1395, lng: 122.993 };
const tri: PickupVehicle = { id: "t", vehicle: "tricycle", label: null, seats: 3, baseFee: 50, perKm: 15, maxKm: 10 };

describe("door pickup", () => {
  it("prices the ride the same way the database does (6.9 km → ₱154)", () => {
    expect(roadKm(bagasbas, meeting)).toBe(6.9);
    expect(quoteDoorPickup(tri, bagasbas, meeting, 2)).toEqual({ ok: true, km: 6.9, fee: 154 });
  });
  it("refuses a group that doesn't fit, or a pickup too far away", () => {
    expect(quoteDoorPickup(tri, bagasbas, meeting, 4)).toMatchObject({ ok: false, reason: "seats" });
    expect(quoteDoorPickup(tri, { lat: 13.6218, lng: 123.1948 }, meeting, 2)).toMatchObject({ ok: false, reason: "too_far" });
  });
  it("names and labels vehicles", () => {
    expect(vehicleName(tri)).toBe("Tricycle");
    expect(vehicleName({ vehicle: "van", label: "Aircon van" })).toBe("Aircon van");
    expect(vehicleRateLabel(tri, (n) => `₱${n}`)).toBe("₱50 + ₱15/km, up to 10 km, 3 seats");
  });
  it("reads rows and drops unknown or inactive vehicles", () => {
    expect(toPickupVehicles([
      { id: "a", vehicle: "van", label: null, seats: "12", base_fee: "300.00", per_km: "25", max_km: "40.0" },
      { id: "b", vehicle: "boat", label: null, seats: 5, base_fee: 0, per_km: 0, max_km: 5 },
      { id: "c", vehicle: "car", label: null, seats: 4, base_fee: 0, per_km: 20, max_km: 10, is_active: false },
    ])).toEqual([{ id: "a", vehicle: "van", label: null, seats: 12, baseFee: 300, perKm: 25, maxKm: 40 }]);
  });
  it("checks the operator's list", () => {
    const ok = validateVehicles([{ vehicle: "tricycle", label: "", seats: "3", baseFee: "", perKm: "15", maxKm: "10" }, { vehicle: "", label: "", seats: "", baseFee: "", perKm: "", maxKm: "" }]);
    expect(ok).toEqual({ ok: true, vehicles: [{ vehicle: "tricycle", label: null, seats: 3, base_fee: 0, per_km: 15, max_km: 10 }] });
    expect(validateVehicles([{ vehicle: "van", label: "", seats: "0", baseFee: "", perKm: "15", maxKm: "10" }])).toMatchObject({ ok: false, error: /seats/ });
    expect(validateVehicles([{ vehicle: "van", label: "", seats: "8", baseFee: "", perKm: "", maxKm: "10" }])).toMatchObject({ ok: false, error: /per km/ });
    expect(validateVehicles([{ vehicle: "boat", label: "", seats: "8", baseFee: "", perKm: "1", maxKm: "10" }])).toMatchObject({ ok: false, error: /type/ });
  });
});
