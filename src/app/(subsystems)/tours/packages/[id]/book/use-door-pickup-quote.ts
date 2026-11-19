"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LatLng } from "@/lib/maps/geo";
import { parseDoorPickupQuote, type DoorPickupQuote } from "@/lib/tours/door-pickup";

export type QuoteState = { status: "idle" } | { status: "loading" } | { status: "done"; quote: DoorPickupQuote } | { status: "error" };

/** Asks the database for the Door pickup quote, 300 ms after the pin, vehicle, guests or option stop changing. */
export function useDoorPickupQuote(args: { packageId: string; vehicleId: string | null; pin: LatLng | null; pax: number; variantId: string | null }): QuoteState {
  const { packageId, vehicleId, pin, pax, variantId } = args;
  const [state, setState] = useState<QuoteState>({ status: "idle" });
  const lat = pin?.lat ?? null;
  const lng = pin?.lng ?? null;

  useEffect(() => {
    if (!vehicleId || lat == null || lng == null) {
      setState({ status: "idle" });
      return;
    }
    let live = true;
    setState({ status: "loading" });
    const timer = setTimeout(async () => {
      const { data, error } = await createSupabaseBrowserClient().rpc("tours_quote_door_pickup", {
        p_package_id: packageId,
        p_vehicle_id: vehicleId,
        p_lat: lat,
        p_lng: lng,
        p_pax: pax,
        p_variant_id: variantId ?? undefined,
      });
      if (live) setState(error ? { status: "error" } : { status: "done", quote: parseDoorPickupQuote(data) });
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [packageId, vehicleId, lat, lng, pax, variantId]);

  return state;
}
