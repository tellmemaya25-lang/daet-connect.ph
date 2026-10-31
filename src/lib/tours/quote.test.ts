import { formatPeso } from "@/lib/money";
import { addonMax, childPriceLabel, groupDealLabel, quoteBooking, type QuoteAddon } from "./quote";

const peso = formatPeso;
const camping = { price_per_pax: 2799, flat_price: null, group_min_pax: 16, group_discount_per_pax: 200, group_free_pax: 1 };
const dayTour = { price_per_pax: 1999, flat_price: null, child_max_age: 6, child_price_percent: 50 };
const extras: QuoteAddon[] = [
  { id: "tent3", name: "Tent for 3", price: 200, unit: "per_booking", bookable: true },
  { id: "cabana", name: "Closed cabana", price: 4500, unit: "per_night", bookable: true },
  { id: "gen", name: "Morning generator", price: 500, unit: "per_hour", bookable: false },
];

describe("quoteBooking", () => {
  it("charges per person below the group size", () => {
    const q = quoteBooking({ variant: camping, guests: 4, peso });
    expect(q.total).toBe(11196);
    expect(q.saving).toBe(0);
  });

  it("applies the group deal from 16 guests: 1 free and ₱200 off the other 15", () => {
    const q = quoteBooking({ variant: camping, guests: 16, peso });
    expect(q.total).toBe(2799 * 15 - 200 * 15);
    expect(q.saving).toBe(2799 + 3000);
  });

  it("charges children their percent on options with a child price, and ignores children elsewhere", () => {
    expect(quoteBooking({ variant: dayTour, guests: 3, children: 1, peso }).total).toBe(1999 * 2 + 999.5);
    expect(quoteBooking({ variant: camping, guests: 3, children: 1, peso }).total).toBe(2799 * 3);
  });

  it("adds bookable extras only, and caps the reservation fee at the total", () => {
    const q = quoteBooking({ variant: camping, guests: 2, addons: extras, chosen: { tent3: 1, cabana: 2, gen: 3 }, depositPerPax: 500, peso });
    expect(q.addonsTotal).toBe(200 + 9000);
    expect(q.total).toBe(2799 * 2 + 9200);
    expect(q.deposit).toBe(1000);
    expect(quoteBooking({ variant: { price_per_pax: 300, flat_price: null }, guests: 1, depositPerPax: 500, peso }).deposit).toBe(300);
  });

  it("uses the flat price for whole-group options", () => {
    expect(quoteBooking({ variant: { price_per_pax: null, flat_price: 20000 }, guests: 25, peso }).total).toBe(20000);
  });
});

describe("labels and limits", () => {
  it("describes the child price and the group deal", () => {
    expect(childPriceLabel(dayTour)).toBe("Ages 6 and below pay half");
    expect(childPriceLabel(camping)).toBeNull();
    expect(groupDealLabel(camping, peso)).toBe("16 or more guests: ₱200.00 off per person and 1 goes free");
  });
  it("lets per-person extras go up to the guests", () => {
    expect(addonMax("per_person", 4)).toBe(4);
    expect(addonMax("per_night", 4)).toBe(20);
  });
});
