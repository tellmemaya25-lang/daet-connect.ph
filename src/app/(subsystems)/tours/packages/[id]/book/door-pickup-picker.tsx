"use client";

import { LocationPicker } from "@/components/maps/location-picker";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { formatPeso } from "@/lib/money";
import type { LatLng } from "@/lib/maps/geo";
import { quoteDoorPickup, vehicleName, vehicleRateLabel, type PickupShortcut, type PickupVehicle } from "@/lib/tours/door-pickup";

/**
 * Door pickup ("pasundo"): pin where you are, choose the vehicle the operator
 * sends, see the fee to the meeting point. The database works the fee out
 * again from the same pin when the booking is saved.
 */
export function DoorPickupPicker({
  vehicles,
  shortcuts = [],
  meeting,
  meetingName,
  pax,
  pin,
  onPin,
  vehicleId,
  onVehicle,
  note,
  onNote,
}: {
  vehicles: PickupVehicle[];
  shortcuts?: PickupShortcut[];
  meeting: LatLng;
  meetingName: string;
  pax: number;
  pin: LatLng | null;
  onPin: (p: LatLng) => void;
  vehicleId: string;
  onVehicle: (id: string) => void;
  note: string;
  onNote: (s: string) => void;
}) {
  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-line p-4">
      <p className="text-sm font-bold text-daet-ink">1. Where should we pick you up?</p>
      <p className="text-xs text-daet-ink/70">Search your hotel or barangay, tap the map, or use your location. We bring you to {meetingName}.</p>
      {shortcuts.length ? (
        <div role="group" aria-label="Common pickup spots" className="flex flex-wrap gap-2">
          {shortcuts.map((s) => {
            const on = pin?.lat === s.lat && pin?.lng === s.lng;
            return (
              <Button key={s.id} type="button" variant={on ? "primary" : "secondary"} aria-pressed={on} onClick={() => { onPin({ lat: s.lat, lng: s.lng }); if (!note.trim()) onNote(s.name); }}>
                {s.name}
              </Button>
            );
          })}
        </div>
      ) : null}
      <LocationPicker latitude={pin?.lat ?? null} longitude={pin?.lng ?? null} onChange={(lat, lng) => onPin({ lat, lng })} className="h-56" />
      <Field id="pickupNote" label="Landmark for the driver (optional)" hint="e.g. Hotel name and room, or the gate color">
        <Input maxLength={200} value={note} onChange={(e) => onNote(e.target.value)} />
      </Field>

      <fieldset>
        <legend className="text-sm font-bold text-daet-ink">2. Choose the vehicle</legend>
        <ul className="mt-2 space-y-2">
          {vehicles.map((v) => {
            const quote = pin ? quoteDoorPickup(v, pin, meeting, pax) : null;
            const disabled = Boolean(quote && !quote.ok);
            return (
              <li key={v.id}>
                <label className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${vehicleId === v.id ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40" : "border-line"} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}>
                  <Checkbox type="radio" name="pickupVehicle" className="mt-1" checked={vehicleId === v.id} disabled={disabled} onChange={() => onVehicle(v.id)} />
                  <span className="flex-1">
                    <span className="font-bold text-daet-ink">{vehicleName(v)}</span>
                    <span className="block text-daet-ink/70">{vehicleRateLabel(v, formatPeso)}</span>
                    <span className="block text-xs text-daet-ink/60">Source: {v.rate.source}</span>
                    {quote ? (
                      quote.ok ? (
                        <span className="block font-bold text-daet-ink">
                          {quote.km} km · {formatPeso(quote.fee)}
                        </span>
                      ) : (
                        <span className="block text-amber-800 dark:text-amber-300">
                          {quote.reason === "seats" ? `Seats ${v.seats}; you are ${pax}.` : `${quote.km} km away; this vehicle goes up to ${v.maxKm} km.`}
                        </span>
                      )
                    ) : (
                      <span className="block text-daet-ink/70">Pin your location to see the fee.</span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
      <p className="text-xs text-daet-ink/70">Distance is by road, estimated from the map. The fee is added to your total and confirmed when you book.</p>
    </div>
  );
}
