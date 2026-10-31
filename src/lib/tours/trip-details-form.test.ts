import { parseTripDetails, type TripDetailsInput } from "./trip-details-form";

const base: TripDetailsInput = {
  itinerary: [
    { day_number: "1", start_time: "6:00 AM", activity: "Meet at Vinzons Tourism." },
    { day_number: "1", start_time: "", activity: "" },
  ],
  thingsToBring: "Sunblock\n\nPower bank\n",
  goodToKnow: "Generator runs 6 PM to 6 AM.",
  addons: [{ name: "Closed cabana", price: "4500", unit: "per_night", max_guests: "6", needs_reservation: true, bookable: true, note: "" }],
  depositPerPax: "500",
  depositRefundable: false,
  cancellationPolicy: "Not refundable, transferable.",
  variantRules: [{ variant_id: "v1", child_max_age: "", child_price_percent: "", group_min_pax: "16", group_discount_per_pax: "200", group_free_pax: "1" }],
};

describe("parseTripDetails", () => {
  it("builds the full payload, dropping blank rows and lines", () => {
    const result = parseTripDetails(base, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.itinerary).toEqual([{ day_number: 1, start_time: "6:00 AM", activity: "Meet at Vinzons Tourism." }]);
    expect(result.payload.things_to_bring).toEqual(["Sunblock", "Power bank"]);
    expect(result.payload.addons).toEqual([{ name: "Closed cabana", price: 4500, unit: "per_night", max_guests: 6, needs_reservation: true, bookable: true, note: null }]);
    expect(result.payload.deposit_per_pax).toBe(500);
    expect(result.payload.variant_rules).toEqual([{ variant_id: "v1", child_max_age: null, child_price_percent: null, group_min_pax: 16, group_discount_per_pax: 200, group_free_pax: 1 }]);
  });

  it("sends only text details for a published package", () => {
    const result = parseTripDetails(base, false);
    expect(result.ok && Object.keys(result.payload).sort()).toEqual(["good_to_know", "itinerary", "things_to_bring"]);
  });

  it("explains what's wrong", () => {
    const bad = parseTripDetails(
      {
        ...base,
        itinerary: [{ day_number: "1", start_time: "7:00", activity: "" }],
        addons: [{ ...base.addons[0], price: "lots" }],
        depositPerPax: "-5",
        variantRules: [
          { variant_id: "v1", child_max_age: "6", child_price_percent: "", group_min_pax: "", group_discount_per_pax: "", group_free_pax: "" },
          { variant_id: "v2", child_max_age: "", child_price_percent: "", group_min_pax: "10", group_discount_per_pax: "", group_free_pax: "" },
        ],
      },
      true,
    );
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors["itinerary.0"]).toMatch(/what happens/);
    expect(bad.errors["addons.0"]).toMatch(/price/);
    expect(bad.errors.depositPerPax).toBeDefined();
    expect(bad.errors["rules.0"]).toMatch(/both/);
    expect(bad.errors["rules.1"]).toMatch(/needs money off/);
  });
});
