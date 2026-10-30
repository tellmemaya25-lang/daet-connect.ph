import type { FareLeg } from "@/lib/tours/guide/fares";
import type { GuidePlace } from "@/lib/tours/guide/places";

/**
 * Trip cost estimates for the travel assistant. Every line is a min–max
 * range taken from the directory, a tour price or an entrance fee, with
 * where it came from. A cost the directory does not know is listed as
 * "ask locally" and left out of the total: nothing is made up.
 */

export type CostStyle = "budget" | "mid" | "comfort";

export type CostLine = {
  label: string;
  min: number | null;
  max: number | null;
  /** How the amount was worked out, e.g. "₱801 × 2 people × 2 ways". */
  note: string;
  source: string | null;
};

export type CostEstimate = {
  lines: CostLine[];
  totalMin: number;
  totalMax: number;
  perPersonMin: number;
  perPersonMax: number;
  /** Lines with no known amount, so the traveller knows the total is partial. */
  unknown: string[];
  people: number;
  nights: number;
};

export type CostInput = {
  people: number;
  nights: number;
  style: CostStyle;
  /** Legs for one way; the estimate counts the trip back too. */
  legs: FareLeg[];
  tour?: { title: string; price: number; perPerson: boolean } | null;
  /** Entrance fees per person, by place. */
  entranceFees?: Array<{ name: string; fee: number }>;
  eateries: Pick<GuidePlace, "name" | "price_min" | "price_max" | "price_unit" | "source">[];
  lodgings: Pick<GuidePlace, "name" | "price_min" | "price_max" | "price_unit" | "source">[];
  format: (n: number) => string;
};

export const BUFFER_RATE = 0.1;
export const MEALS_PER_DAY = 3;
const ROOM_SIZE = 2;

const round = (n: number) => Math.round(n);

/** Price ranges for one unit, pick the band that suits the travel style. */
function band(places: CostInput["eateries"], unit: "meal" | "night", style: CostStyle) {
  const priced = places
    .filter((p) => p.price_unit === unit && (p.price_min !== null || p.price_max !== null))
    .map((p) => ({ ...p, lo: (p.price_min ?? p.price_max) as number, hi: (p.price_max ?? p.price_min) as number }))
    .sort((a, b) => a.lo - b.lo);
  if (!priced.length) return null;
  const pick = style === "budget" ? priced[0] : style === "comfort" ? priced[priced.length - 1] : priced[Math.floor((priced.length - 1) / 2)];
  return pick;
}

export function estimateTripCost(input: CostInput): CostEstimate {
  const people = Math.max(1, Math.min(50, Math.round(input.people)));
  const nights = Math.max(0, Math.min(30, Math.round(input.nights)));
  const days = nights + 1;
  const { format } = input;
  const lines: CostLine[] = [];
  const unknown: string[] = [];

  for (const leg of input.legs) {
    const label = `${leg.mode === "boat" ? "Boat" : leg.mode[0].toUpperCase() + leg.mode.slice(1).replace("_", "-")}: ${leg.from_name} to ${leg.to_name}`;
    if (leg.fare_min === null && leg.fare_max === null) {
      lines.push({ label, min: null, max: null, note: "Ask locally: no fare on record yet.", source: leg.source });
      unknown.push(label);
      continue;
    }
    const lo = (leg.fare_min ?? leg.fare_max) as number;
    const hi = (leg.fare_max ?? leg.fare_min) as number;
    const shared = leg.fare_per !== "person";
    const times = shared ? 2 : people * 2;
    const note = shared
      ? `${format(lo)}${hi !== lo ? `–${format(hi)}` : ""} ${leg.fare_per === "boat" ? "per boat" : "per trip"} × 2 ways, shared by the group`
      : `${format(lo)}${hi !== lo ? `–${format(hi)}` : ""} × ${people} ${people === 1 ? "person" : "people"} × 2 ways`;
    lines.push({ label, min: lo * times, max: hi * times, note, source: leg.source });
  }

  if (input.tour) {
    const total = input.tour.perPerson ? input.tour.price * people : input.tour.price;
    lines.push({
      label: `Tour: ${input.tour.title}`,
      min: total,
      max: total,
      note: input.tour.perPerson ? `${format(input.tour.price)} × ${people}` : "Group price",
      source: "Tour price on CONNECT-Daet",
    });
  }

  for (const fee of input.entranceFees ?? []) {
    if (fee.fee <= 0) continue;
    lines.push({ label: `Entrance: ${fee.name}`, min: fee.fee * people, max: fee.fee * people, note: `${format(fee.fee)} × ${people}`, source: "CONNECT-Daet places" });
  }

  const meal = band(input.eateries, "meal", input.style);
  const meals = days * MEALS_PER_DAY * people;
  if (meal) {
    lines.push({
      label: "Meals",
      min: meal.lo * meals,
      max: meal.hi * meals,
      note: `${meals} meals (${days} ${days === 1 ? "day" : "days"} × ${MEALS_PER_DAY} × ${people}) at ${format(meal.lo)}${meal.hi !== meal.lo ? `–${format(meal.hi)}` : ""}, e.g. ${meal.name}`,
      source: meal.source,
    });
  } else {
    lines.push({ label: "Meals", min: null, max: null, note: `Ask locally: ${meals} meals, no meal prices on record yet.`, source: null });
    unknown.push("Meals");
  }

  if (nights > 0) {
    const room = band(input.lodgings, "night", input.style);
    const rooms = Math.ceil(people / ROOM_SIZE);
    if (room) {
      lines.push({
        label: `Stay: ${room.name}`,
        min: room.lo * nights * rooms,
        max: room.hi * nights * rooms,
        note: `${rooms} ${rooms === 1 ? "room" : "rooms"} × ${nights} ${nights === 1 ? "night" : "nights"} from ${format(room.lo)}`,
        source: room.source,
      });
    } else {
      lines.push({ label: "Stay", min: null, max: null, note: "Ask locally: no room prices on record yet.", source: null });
      unknown.push("Stay");
    }
  }

  const knownMin = lines.reduce((sum, l) => sum + (l.min ?? 0), 0);
  const knownMax = lines.reduce((sum, l) => sum + (l.max ?? 0), 0);
  if (knownMax > 0) {
    lines.push({ label: "Extra for the unexpected (10%)", min: round(knownMin * BUFFER_RATE), max: round(knownMax * BUFFER_RATE), note: "Snacks, tips, small fees", source: null });
  }
  const totalMin = round(lines.reduce((sum, l) => sum + (l.min ?? 0), 0));
  const totalMax = round(lines.reduce((sum, l) => sum + (l.max ?? 0), 0));
  return {
    lines: lines.map((l) => ({ ...l, min: l.min === null ? null : round(l.min), max: l.max === null ? null : round(l.max) })),
    totalMin,
    totalMax,
    perPersonMin: round(totalMin / people),
    perPersonMax: round(totalMax / people),
    unknown,
    people,
    nights,
  };
}
