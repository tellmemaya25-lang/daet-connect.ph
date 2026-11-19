"use client";

import { useState } from "react";
import { LocationPicker } from "@/components/maps/location-picker";
import { Field, Input, Select } from "@/components/ui/field";
import { formatPeso } from "@/lib/money";
import type { LatLng } from "@/lib/maps/geo";
import type { QuoteState } from "./use-door-pickup-quote";
import { doorPickupProblem, vehicleName, vehicleRateLabel, type PickupShortcut, type PickupVehicle } from "@/lib/tours/door-pickup";

const ON_MAP = "map";

/**
 * Door pickup ("pasundo"), laid out like the fare calculator: pick me up at
 * (a known Daet spot, or a pin on the map) → take me to (the tour's meeting
 * point) with the operator's vehicle, for the group. The fee is the Door
 * pickup quote from the database, the same one the booking is charged.
 */
export function DoorPickupPicker({
  vehicle,
  shortcuts = [],
  meetingName,
  pax,
  pin,
  onPin,
  note,
  onNote,
  quote: state,
}: {
  vehicle: PickupVehicle;
  shortcuts?: PickupShortcut[];
  meetingName: string;
  pax: number;
  pin: LatLng | null;
  onPin: (p: LatLng) => void;
  note: string;
  onNote: (s: string) => void;
  /** The Door pickup quote from the database. */
  quote: QuoteState;
}) {
  const [from, setFrom] = useState(shortcuts.length ? "" : ON_MAP);

  function chooseFrom(value: string) {
    setFrom(value);
    const spot = shortcuts.find((s) => s.id === value);
    if (spot) {
      onPin({ lat: spot.lat, lng: spot.lng });
      onNote(spot.name);
    }
  }

  return (
    <div className="mt-3 space-y-4 rounded-2xl border border-line p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="pickupFrom" label="Pick me up at">
          <Select value={from} onChange={(e) => chooseFrom(e.target.value)}>
            {shortcuts.length ? (
              <option value="" disabled>
                Choose where you are
              </option>
            ) : null}
            {shortcuts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value={ON_MAP}>Somewhere else (pin it on the map)</option>
          </Select>
        </Field>
        <div>
          <p className="text-sm font-bold text-daet-ink">Take me to</p>
          <p className="mt-1 rounded-xl bg-muted px-4 py-3 text-sm text-daet-ink">{meetingName}</p>
        </div>
        <div>
          <p className="text-sm font-bold text-daet-ink">Vehicle</p>
          <p className="mt-1 rounded-xl bg-muted px-4 py-3 text-sm text-daet-ink">
            <span className="font-bold">{vehicleName(vehicle)}</span>
            <span className="block text-xs text-daet-ink/70">{vehicleRateLabel(vehicle, formatPeso)}</span>
          </p>
        </div>
        <div>
          <p className="text-sm font-bold text-daet-ink">How many of you?</p>
          <p className="mt-1 rounded-xl bg-muted px-4 py-3 text-sm text-daet-ink">
            {pax} guest{pax === 1 ? "" : "s"} <span className="text-daet-ink/70">(from Number of guests)</span>
          </p>
        </div>
      </div>

      {from === ON_MAP ? (
        <div className="space-y-2">
          <p className="text-xs text-daet-ink/70">Search your hotel or barangay, tap the map, or use your location.</p>
          <LocationPicker latitude={pin?.lat ?? null} longitude={pin?.lng ?? null} onChange={(lat, lng) => onPin({ lat, lng })} className="h-56" />
        </div>
      ) : null}

      <Field id="pickupNote" label="Landmark for the driver (optional)" hint="e.g. Hotel name and room, or the gate color">
        <Input maxLength={200} value={note} onChange={(e) => onNote(e.target.value)} />
      </Field>

      <div role="status" aria-live="polite" className="rounded-xl bg-daet-sand/30 p-3 text-sm text-daet-ink">
        {!pin || state.status === "idle" ? (
          "Choose where you are to see the pickup price."
        ) : state.status === "loading" ? (
          "Calculating…"
        ) : state.status === "error" ? (
          "We couldn't work out the pickup price. Try again in a moment."
        ) : state.quote.ok ? (
          <>
            <span className="font-bold">
              {state.quote.km} km · {formatPeso(state.quote.fee)}
            </span>{" "}
            {state.quote.vehicleLabel.toLowerCase()} pickup, added to your total.
          </>
        ) : (
          doorPickupProblem(state.quote, pax)
        )}
      </div>
      <p className="text-xs text-daet-ink/60">
        Official fare: {vehicle.rate.source}. Distance is by road, estimated from the map, and confirmed when you book.
      </p>
    </div>
  );
}
