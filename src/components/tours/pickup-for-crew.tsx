import { PICKUP_VEHICLES, type PickupVehicleType } from "@/lib/tours/door-pickup";

type PickupRow = {
  pickup_lat?: number | string | null;
  pickup_lng?: number | string | null;
  pickup_note?: string | null;
  pickup_vehicle?: string | null;
  pickup_km?: number | string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
};

/** Where to fetch a guest who asked for a pickup, for whoever drives: null when no pickup. */
export function pickupForCrew(row: PickupRow) {
  const lat = row.pickup_lat == null ? NaN : Number(row.pickup_lat);
  const lng = row.pickup_lng == null ? NaN : Number(row.pickup_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const vehicle = row.pickup_vehicle ? (PICKUP_VEHICLES[row.pickup_vehicle as PickupVehicleType] ?? row.pickup_vehicle) : null;
  return {
    lat,
    lng,
    place: row.pickup_note?.trim() || null,
    vehicle,
    km: row.pickup_km == null ? null : Number(row.pickup_km),
    directions: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    name: row.contact_name?.trim() || null,
    phone: row.contact_phone?.trim() || null,
  };
}

/** The pickup box on the guide's tour card and guest list. */
export function PickupForCrew({ booking, className = "" }: { booking: PickupRow; className?: string }) {
  const p = pickupForCrew(booking);
  if (!p) return null;
  return (
    <div className={`rounded-2xl bg-daet-sand/40 p-3 text-sm text-daet-ink ${className}`}>
      <p className="font-bold">Pick up the guests</p>
      <p className="mt-1">
        {p.place ? <span className="font-bold">{p.place}</span> : "At the pin on the map"}
        {p.vehicle ? ` · ${p.vehicle}` : ""}
        {p.km != null && Number.isFinite(p.km) ? ` · ${p.km} km to the meeting point` : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <a href={p.directions} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-bold text-blue-700 underline dark:text-blue-300">
          Directions to the guest<span className="sr-only"> (opens Google Maps)</span>
        </a>
        {p.phone ? (
          <a href={`tel:${p.phone}`} className="inline-flex min-h-11 items-center font-bold text-blue-700 underline dark:text-blue-300">
            Call {p.name ?? "the guest"}: {p.phone}
          </a>
        ) : null}
      </div>
    </div>
  );
}
