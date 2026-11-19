/**
 * Door pickup ("pasundo", 20261212): the operator sends a vehicle to where the
 * tourist is and brings them to the meeting point. The price is never the
 * operator's: it comes from the official fare for the vehicle type
 * (tours_official_pickup_rates, 20261213). A type with no official fare can't
 * be offered. The price is a Door pickup quote from the database
 * (tours_quote_door_pickup, 20261219); this file only reads and words it.
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
/** One pickup vehicle per tour. */
export const MAX_PICKUP_VEHICLES = 1;

/** An official fare for a vehicle type, with where it came from. */
export type OfficialRate = { vehicle: PickupVehicleType; baseFee: number; perKmPerPerson: number; source: string; sourceUrl: string | null; effectiveOn: string | null; checkedOn: string };

export type PickupVehicle = { id: string; vehicle: PickupVehicleType; label: string | null; seats: number; maxKm: number; rate: OfficialRate };

export const vehicleName = (v: Pick<PickupVehicle, "vehicle" | "label">) => v.label?.trim() || PICKUP_VEHICLES[v.vehicle];

/** Why a pin can't be quoted (same codes as tours_quote_door_pickup). */
export type DoorPickupReason = "no_pin" | "no_meeting" | "no_vehicle" | "no_rate" | "seats" | "too_far";

/** The server's Door pickup quote: the only place the price is worked out. */
export type DoorPickupQuote =
  | { ok: true; km: number; fee: number; tourTotal: number | null; grandTotal: number | null; vehicleLabel: string }
  | { ok: false; reason: DoorPickupReason; km: number | null; seats: number | null; maxKm: number | null; vehicleLabel: string | null };

const REASONS: readonly DoorPickupReason[] = ["no_pin", "no_meeting", "no_vehicle", "no_rate", "seats", "too_far"];
const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** tours_quote_door_pickup JSON → a quote; anything unreadable is "no_vehicle". */
export function parseDoorPickupQuote(raw: unknown): DoorPickupQuote {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const label = typeof o.vehicle_label === "string" ? o.vehicle_label : null;
  const fee = num(o.pickup_fee);
  const km = num(o.distance_km);
  if (o.ok === true && fee != null && km != null && label) {
    return { ok: true, km, fee, tourTotal: num(o.tour_total), grandTotal: num(o.grand_total), vehicleLabel: label };
  }
  const reason = REASONS.find((r) => r === o.reason) ?? "no_vehicle";
  return { ok: false, reason, km, seats: num(o.seats), maxKm: num(o.max_km), vehicleLabel: label };
}

/** A plain sentence for a quote that failed. */
export function doorPickupProblem(q: Extract<DoorPickupQuote, { ok: false }>, pax: number): string {
  const name = (q.vehicleLabel ?? "vehicle").toLowerCase();
  switch (q.reason) {
    case "seats":
      return `The ${name} seats ${q.seats}; you are ${pax}.`;
    case "too_far":
      return `That is ${q.km} km from the meeting point; this tour picks up within ${q.maxKm} km.`;
    case "no_rate":
      return `The ${name} has no official fare yet, so door pickup isn't available.`;
    case "no_meeting":
      return "This tour has no meeting point on the map yet, so door pickup can't be priced.";
    case "no_pin":
      return "Choose where you are to see the pickup price.";
    default:
      return "Door pickup isn't available for this tour right now.";
  }
}

/** "₱2.60/km per person (official fare), up to 10 km, 3 seats". */
export function vehicleRateLabel(v: PickupVehicle, peso: (n: number) => string): string {
  const base = v.rate.baseFee > 0 ? `${peso(v.rate.baseFee)} + ` : "";
  return `${base}${peso(v.rate.perKmPerPerson)}/km per person (official fare), up to ${v.maxKm} km, ${v.seats} seat${v.seats === 1 ? "" : "s"}`;
}

type RateRow = { vehicle: string; base_fee: number | string; per_km_per_person: number | string; source: string; source_url: string | null; effective_on: string | null; checked_on: string };

/** Official fare rows → rates by vehicle type. */
export function toOfficialRates(rows: RateRow[] | null | undefined): Partial<Record<PickupVehicleType, OfficialRate>> {
  const out: Partial<Record<PickupVehicleType, OfficialRate>> = {};
  for (const r of rows ?? []) {
    const per = Number(r.per_km_per_person);
    if (!isPickupVehicleType(r.vehicle) || !(per > 0)) continue;
    out[r.vehicle] = { vehicle: r.vehicle, baseFee: Number(r.base_fee) || 0, perKmPerPerson: per, source: r.source, sourceUrl: r.source_url, effectiveOn: r.effective_on, checkedOn: r.checked_on };
  }
  return out;
}

type Row = { id: string; vehicle: string; label: string | null; seats: number | string; max_km: number | string; is_active?: boolean | null };

/** Database rows → vehicles with an official fare, active ones only, in the operator's order. */
export function toPickupVehicles(rows: Row[] | null | undefined, rates: Partial<Record<PickupVehicleType, OfficialRate>>): PickupVehicle[] {
  return (rows ?? []).flatMap((r) => {
    if (r.is_active === false || !isPickupVehicleType(r.vehicle)) return [];
    const rate = rates[r.vehicle];
    return rate ? [{ id: r.id, vehicle: r.vehicle, label: r.label, seats: Number(r.seats) || 1, maxKm: Number(r.max_km) || 0, rate }] : [];
  });
}

export type VehicleDraft = { vehicle: string; label: string; seats: string; maxKm: string };
export type VehicleInput = { vehicle: PickupVehicleType; label: string | null; seats: number; max_km: number };

/** Early messages for the operator's form; tours_set_pickup_vehicles decides. */
export function validateVehicles(drafts: VehicleDraft[], priced: readonly string[]): { ok: true; vehicles: VehicleInput[] } | { ok: false; error: string } {
  const filled = drafts.filter((d) => d.vehicle || d.seats);
  if (filled.length > MAX_PICKUP_VEHICLES) return { ok: false, error: "Set one pickup vehicle for this tour." };
  const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/,/g, "")));
  const vehicles: VehicleInput[] = [];
  for (const [i, d] of filled.entries()) {
    const n = i + 1;
    if (!isPickupVehicleType(d.vehicle)) return { ok: false, error: `Vehicle ${n}: choose a type.` };
    if (!priced.includes(d.vehicle)) return { ok: false, error: `Vehicle ${n}: ${PICKUP_VEHICLES[d.vehicle]} has no official fare yet.` };
    const seats = num(d.seats);
    const maxKm = num(d.maxKm);
    if (!Number.isInteger(seats) || seats < 1 || seats > 30) return { ok: false, error: `Vehicle ${n}: seats must be 1 to 30.` };
    if (!(maxKm > 0 && maxKm <= 200)) return { ok: false, error: `Vehicle ${n}: the farthest pickup must be 1 to 200 km.` };
    vehicles.push({ vehicle: d.vehicle, label: d.label.trim().slice(0, 80) || null, seats, max_km: Math.round(maxKm * 10) / 10 });
  }
  return { ok: true, vehicles };
}

/** A well-known place to drop the pickup pin on with one tap. */
export type PickupShortcut = { id: string; name: string; lat: number; lng: number };

type ShortcutRow = { id: string; name: string; latitude: number | string | null; longitude: number | string | null };

/** Places with a usable pin, in the order given. */
export function toPickupShortcuts(rows: ShortcutRow[] | null | undefined): PickupShortcut[] {
  return (rows ?? []).flatMap((r) => {
    const lat = Number(r.latitude);
    const lng = Number(r.longitude);
    return r.latitude != null && r.longitude != null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [{ id: r.id, name: r.name, lat, lng }] : [];
  });
}
