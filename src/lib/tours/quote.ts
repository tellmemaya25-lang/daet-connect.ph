/**
 * Booking price, the same maths as the tours_bookings_before_insert database
 * trigger (which is what actually saves the total). The booking form uses it
 * to show the total before the tourist submits.
 *
 * - Per-person options: adults pay the price, children (where the option has a
 *   child price) pay child_price_percent of it.
 * - Group deal: from group_min_pax guests, group_free_pax adults go free and the
 *   other adults get group_discount_per_pax off.
 * - Flat options: the flat price, whatever the group size.
 * - Extras: price × quantity.
 * - Reservation fee: deposit_per_pax × guests, never more than the total.
 */

export type AddonUnit = "per_booking" | "per_person" | "per_night" | "per_hour" | "per_item";

export type QuoteVariant = {
  price_per_pax: number | null;
  flat_price: number | null;
  child_max_age?: number | null;
  child_price_percent?: number | null;
  group_min_pax?: number | null;
  group_discount_per_pax?: number | null;
  group_free_pax?: number | null;
};

export type QuoteAddon = { id: string; name: string; price: number; unit: AddonUnit; bookable: boolean };

export type QuoteLine = { label: string; amount: number };

export type Quote = {
  base: number;
  saving: number;
  addonsTotal: number;
  total: number;
  deposit: number | null;
  lines: QuoteLine[];
};

const money = (n: number) => Math.round(n * 100) / 100;

export const UNIT_LABEL: Record<AddonUnit, string> = {
  per_booking: "per booking",
  per_person: "per person",
  per_night: "per night",
  per_hour: "per hour",
  per_item: "each",
};

export function hasChildPrice(variant: QuoteVariant): boolean {
  return variant.price_per_pax != null && variant.child_price_percent != null && variant.child_max_age != null;
}

/** "Ages 6 and below pay half" / "… pay 70%". */
export function childPriceLabel(variant: QuoteVariant): string | null {
  if (!hasChildPrice(variant)) return null;
  const pct = variant.child_price_percent!;
  const share = pct === 50 ? "half" : pct === 0 ? "nothing" : `${pct}%`;
  return `Ages ${variant.child_max_age} and below pay ${share}`;
}

/** "16 or more guests: ₱200 off per person and 1 goes free". */
export function groupDealLabel(variant: QuoteVariant, peso: (n: number) => string): string | null {
  if (!variant.group_min_pax) return null;
  const parts: string[] = [];
  if (variant.group_discount_per_pax) parts.push(`${peso(variant.group_discount_per_pax)} off per person`);
  if (variant.group_free_pax) parts.push(`${variant.group_free_pax} goes free`);
  return parts.length ? `${variant.group_min_pax} or more guests: ${parts.join(" and ")}` : null;
}

export function quoteBooking(input: {
  variant: QuoteVariant;
  guests: number;
  children?: number;
  addons?: QuoteAddon[];
  chosen?: Record<string, number>;
  depositPerPax?: number | null;
  peso: (n: number) => string;
}): Quote {
  const { variant, guests, peso } = input;
  const children = hasChildPrice(variant) ? Math.min(Math.max(0, input.children ?? 0), guests) : 0;
  const lines: QuoteLine[] = [];
  let base: number;
  let saving = 0;

  if (variant.price_per_pax != null) {
    const price = variant.price_per_pax;
    const adults = guests - children;
    let free = 0;
    let discount = 0;
    if (variant.group_min_pax && guests >= variant.group_min_pax) {
      free = Math.min(variant.group_free_pax ?? 0, adults);
      discount = (variant.group_discount_per_pax ?? 0) * (adults - free);
    }
    const childPrice = money((price * (variant.child_price_percent ?? 100)) / 100);
    base = money(price * (adults - free) + childPrice * children - discount);
    saving = money(price * free + discount);
    lines.push({ label: `${peso(price)} × ${adults} adult${adults === 1 ? "" : "s"}`, amount: money(price * adults) });
    if (children) lines.push({ label: `${peso(childPrice)} × ${children} child${children === 1 ? "" : "ren"}`, amount: money(childPrice * children) });
    if (free) lines.push({ label: `Group deal: ${free} free`, amount: -money(price * free) });
    if (discount) lines.push({ label: `Group deal: ${peso(variant.group_discount_per_pax ?? 0)} off × ${adults - free}`, amount: -money(discount) });
  } else {
    base = money(variant.flat_price ?? 0);
    lines.push({ label: "Group price", amount: base });
  }

  let addonsTotal = 0;
  for (const addon of input.addons ?? []) {
    const qty = input.chosen?.[addon.id] ?? 0;
    if (!addon.bookable || qty <= 0) continue;
    const amount = money(addon.price * qty);
    addonsTotal = money(addonsTotal + amount);
    lines.push({ label: `${addon.name}${qty > 1 ? ` × ${qty}` : ""}`, amount });
  }

  const total = money(Math.max(0, base) + addonsTotal);
  const deposit = input.depositPerPax ? Math.min(total, money(input.depositPerPax * guests)) : null;
  return { base, saving, addonsTotal, total, deposit, lines };
}

/** The most of an extra one booking can take: per person up to the guests, otherwise 20. */
export function addonMax(unit: AddonUnit, guests: number): number {
  return unit === "per_person" ? Math.max(1, guests) : 20;
}
