import { haversineMeters, ROAD_FACTOR, type LatLng } from "@/lib/maps/geo";

/**
 * Door pickup ("pasundo", 20261212): the operator sends a vehicle to where the
 * tourist is and brings them to the meeting point. The fee is worked out the
 * same way here (to show it before booking) and in the database (which
 * decides it): road km = straight line x ROAD_FACTOR, to 0.1 km; fee = base +
 * per km x km, rounded to the peso.
 */

export const PICKUP_VEHICLES = {
  tricycle: "Tricycle",
  habal_habal: "Habal-habal (motorbike)",
  car: "Car",
  multicab: "Multicab",
  van: "Van",
} as const;
export type PickupVehicleType = keyof typeof PICKUP_VEHICLES;
export const isPickupVehicleType = (v: unknown): v is PickupVehicleType => typeof v === "string" && v in PICKUP_VEHICLES;
export const MAX_PICKUP_VEHICLES = 10;

export type PickupVehicle = { id: string; vehicle: PickupVehicleType; label: string | null; seats: number; baseFee: number; perKm: number; maxKm: number };

export const vehicleName = (v: Pick<PickupVehicle, "vehicle" | "label">) => v.label?.trim() || PICKUP_VEHICLES[v.vehicle];

/** Kilometres by road, to 0.1 km (matches tours_road_km). */
export function roadKm(from: LatLng, to: LatLng): number {
  return Math.round((haversineMeters(from, to) / 1000) * ROAD_FACTOR * 10) / 10;
}

export type PickupQuote = { ok: true; km: number; fee: number } | { ok: false; km: number; reason: "seats" | "too_far" };

/** The fee for this vehicle, from this pin to the meeting point, for this many guests. */
export function quoteDoorPickup(vehicle: PickupVehicle, from: LatLng, meeting: LatLng, pax: number): PickupQuote {
  const km = roadKm(from, meeting);
  if (pax > vehicle.seats) return { ok: false, km, reason: "seats" };
  if (km > vehicle.maxKm) return { ok: false, km, reason: "too_far" };
  return { ok: true, km, fee: Math.round(vehicle.baseFee + vehicle.perKm * km) };
}

/** "₱50 + ₱15/km, up to 10 km, 3 seats". */
export function vehicleRateLabel(v: PickupVehicle, peso: (n: number) => string): string {
  const base = v.baseFee > 0 ? `${peso(v.baseFee)} + ` : "";
  return `${base}${peso(v.perKm)}/km, up to ${v.maxKm} km, ${v.seats} seat${v.seats === 1 ? "" : "s"}`;
}

type Row = { id: string; vehicle: string; label: string | null; seats: number | string; base_fee: number | string; per_km: number | string; max_km: number | string; is_active?: boolean | null };

/** Database rows → vehicles, active ones only, in the operator's order. */
export function toPickupVehicles(rows: Row[] | null | undefined): PickupVehicle[] {
  return (rows ?? [])
    .filter((r) => r.is_active !== false && isPickupVehicleType(r.vehicle))
    .map((r) => ({ id: r.id, vehicle: r.vehicle as PickupVehicleType, label: r.label, seats: Number(r.seats) || 1, baseFee: Number(r.base_fee) || 0, perKm: Number(r.per_km) || 0, maxKm: Number(r.max_km) || 0 }));
}

export type VehicleDraft = { vehicle: string; label: string; seats: string; baseFee: string; perKm: string; maxKm: string };
export type VehicleInput = { vehicle: PickupVehicleType; label: string | null; seats: number; base_fee: number; per_km: number; max_km: number };

/** Checks the operator's list before it is saved; the database checks again. */
export function validateVehicles(drafts: VehicleDraft[]): { ok: true; vehicles: VehicleInput[] } | { ok: false; error: string } {
  const filled = drafts.filter((d) => d.vehicle || d.seats || d.perKm || d.baseFee);
  if (filled.length > MAX_PICKUP_VEHICLES) return { ok: false, error: `List up to ${MAX_PICKUP_VEHICLES} vehicles.` };
  const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/,/g, "")));
  const vehicles: VehicleInput[] = [];
  for (const [i, d] of filled.entries()) {
    const n = i + 1;
    if (!isPickupVehicleType(d.vehicle)) return { ok: false, error: `Vehicle ${n}: choose a type.` };
    const seats = num(d.seats);
    const base = d.baseFee.trim() === "" ? 0 : num(d.baseFee);
    const perKm = num(d.perKm);
    const maxKm = num(d.maxKm);
    if (!Number.isInteger(seats) || seats < 1 || seats > 30) return { ok: false, error: `Vehicle ${n}: seats must be 1 to 30.` };
    if (!(base >= 0 && base <= 100000)) return { ok: false, error: `Vehicle ${n}: the base fee must be 0 or more.` };
    if (!(perKm >= 0 && perKm <= 10000)) return { ok: false, error: `Vehicle ${n}: enter the price per km.` };
    if (!(maxKm > 0 && maxKm <= 200)) return { ok: false, error: `Vehicle ${n}: the farthest pickup must be 1 to 200 km.` };
    vehicles.push({ vehicle: d.vehicle, label: d.label.trim().slice(0, 80) || null, seats, base_fee: Math.round(base * 100) / 100, per_km: Math.round(perKm * 100) / 100, max_km: Math.round(maxKm * 10) / 10 });
  }
  return { ok: true, vehicles };
}
