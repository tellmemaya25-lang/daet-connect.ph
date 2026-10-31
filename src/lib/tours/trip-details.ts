import type { SupabaseClient } from "@supabase/supabase-js";
import type { AddonUnit } from "@/lib/tours/quote";

export type ItineraryRow = { id?: string; day_number: number; start_time: string | null; activity: string; display_order?: number };

export type AddonRow = {
  id: string;
  name: string;
  price: number;
  unit: AddonUnit;
  max_guests: number | null;
  needs_reservation: boolean;
  bookable: boolean;
  note: string | null;
  display_order?: number;
};

export type VariantRules = {
  id: string;
  child_max_age: number | null;
  child_price_percent: number | null;
  group_min_pax: number | null;
  group_discount_per_pax: number | null;
  group_free_pax: number | null;
};

export type TripDetails = {
  itinerary: ItineraryRow[];
  addons: AddonRow[];
  rules: Record<string, VariantRules>;
  thingsToBring: string[];
  goodToKnow: string | null;
  depositPerPax: number | null;
  depositRefundable: boolean;
  cancellationPolicy: string | null;
};

export const EMPTY_TRIP_DETAILS: TripDetails = {
  itinerary: [],
  addons: [],
  rules: {},
  thingsToBring: [],
  goodToKnow: null,
  depositPerPax: null,
  depositRefundable: true,
  cancellationPolicy: null,
};

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

/**
 * A package's itinerary, extras, price-option rules and terms. Each part is
 * read on its own and an error leaves it empty, so a page still renders where
 * the trip-details migration has not been applied yet.
 */
export async function loadTripDetails(supabase: SupabaseClient, packageId: string): Promise<TripDetails> {
  const [itinerary, addons, rules, pkg] = await Promise.all([
    supabase.from("tours_package_itinerary").select("id, day_number, start_time, activity, display_order").eq("package_id", packageId).order("day_number").order("display_order"),
    supabase.from("tours_package_addons").select("id, name, price, unit, max_guests, needs_reservation, bookable, note, display_order").eq("package_id", packageId).order("display_order"),
    supabase.from("tours_package_price_variants").select("id, child_max_age, child_price_percent, group_min_pax, group_discount_per_pax, group_free_pax").eq("package_id", packageId),
    supabase.from("tours_packages").select("things_to_bring, good_to_know, deposit_per_pax, deposit_refundable, cancellation_policy").eq("id", packageId).maybeSingle(),
  ]);
  const row = (pkg.error ? null : pkg.data) as Record<string, unknown> | null;
  return {
    itinerary: itinerary.error ? [] : ((itinerary.data ?? []) as ItineraryRow[]).slice().sort((a, b) => a.day_number - b.day_number || (a.display_order ?? 0) - (b.display_order ?? 0)),
    addons: addons.error ? [] : ((addons.data ?? []) as AddonRow[]).map((a) => ({ ...a, price: Number(a.price) })),
    rules: rules.error
      ? {}
      : Object.fromEntries(
          ((rules.data ?? []) as Record<string, unknown>[]).map((r) => [
            String(r.id),
            {
              id: String(r.id),
              child_max_age: num(r.child_max_age),
              child_price_percent: num(r.child_price_percent),
              group_min_pax: num(r.group_min_pax),
              group_discount_per_pax: num(r.group_discount_per_pax),
              group_free_pax: num(r.group_free_pax),
            },
          ]),
        ),
    thingsToBring: Array.isArray(row?.things_to_bring) ? (row!.things_to_bring as string[]) : [],
    goodToKnow: typeof row?.good_to_know === "string" && row.good_to_know.trim() ? (row.good_to_know as string) : null,
    depositPerPax: num(row?.deposit_per_pax),
    depositRefundable: row?.deposit_refundable === false ? false : true,
    cancellationPolicy: typeof row?.cancellation_policy === "string" && row.cancellation_policy.trim() ? (row.cancellation_policy as string) : null,
  };
}

/** Itinerary rows grouped by day, in order. */
export function itineraryByDay(rows: ItineraryRow[]): Array<{ day: number; rows: ItineraryRow[] }> {
  const days = new Map<number, ItineraryRow[]>();
  for (const row of rows) days.set(row.day_number, [...(days.get(row.day_number) ?? []), row]);
  return [...days.entries()].sort(([a], [b]) => a - b).map(([day, list]) => ({ day, rows: list }));
}
