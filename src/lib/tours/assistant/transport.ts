import type { LatLng } from "@/lib/maps/geo";
import type { Faq } from "@/lib/tours/assistant/knowledge";
import { normalizeText } from "@/lib/tours/itinerary/assistant";

/**
 * Transport knowledge for the travel assistant (R5). Curated, provisional
 * facts: each has a source and the date it was last checked, and every
 * answer says to confirm with the operator or the Tourism Office, because
 * schedules and boat trips change with the season and the weather.
 * Team: verify these with the Daet Tourism Office before the evaluation.
 */

export const TRANSPORT_CHECKED = "2026-10-29";
export const TRANSPORT_SOURCE = "Provisional, compiled from bus operators' public route lists and Camarines Norte tourism guides; to be verified with the Daet Tourism Office.";

const CONFIRM = "Times are typical, not guaranteed: confirm with your bus line, boat or tour operator, or the Daet Tourism Office.";

export const TRANSPORT_FAQS: Faq[] = [
  {
    id: "getting_here",
    title: "Getting to Daet",
    keywords: [
      "get to daet", "getting to daet", "go to daet", "travel to daet", "from manila", "manila to daet", "bus", "buses", "bus terminal", "flight", "fly", "airport", "plane", "drive", "driving", "car",
      "paano pumunta", "papunta", "pumunta sa daet", "byahe", "biyahe", "sasakyan", "eroplano", "galing manila",
    ],
    answer: [
      "By bus from Manila: overnight and daytime buses run from the Cubao and Pasay terminals to Daet. The trip takes about 7–9 hours depending on traffic and stops.",
      "By plane: fly to Naga (Pili) airport, then take a van or bus to Daet, about 2 hours.",
      "By car: about 7–8 hours from Manila along the Maharlika Highway.",
      CONFIRM,
    ].join(" "),
    links: [{ href: "/tours/plan", label: "Plan your days in Daet" }],
  },
  {
    id: "getting_around",
    title: "Getting around Daet",
    keywords: ["get around", "getting around", "tricycle", "trike", "jeep", "jeepney", "van", "taxi", "grab", "commute", "transportation", "transport", "sakay", "sumakay", "traysikel"],
    answer: [
      "Within Daet town, tricycles are the easiest way around; agree on the fare before you ride.",
      "Bagasbas Beach is about 10–15 minutes from the town center by tricycle.",
      "Jeepneys and vans link Daet with nearby towns such as Mercedes, Vinzons and Paracale.",
      "Most tours include transfers from the meeting point, so check the tour's inclusions first.",
      CONFIRM,
    ].join(" "),
    links: [{ href: "/tours/attractions", label: "Places in Daet" }],
  },
  {
    id: "boats",
    title: "Boats to the islands (Calaguas, Mercedes)",
    keywords: ["boat", "boats", "bangka", "banca", "port", "pier", "ferry", "island", "islands", "calaguas", "apuao", "mercedes islands", "island hopping", "sea", "waves", "weather", "typhoon", "habagat", "amihan"],
    answer: [
      "Calaguas: boats leave from Paracale (about 2–2.5 hours) or from Vinzons (about 1.5–2 hours). Most trips leave early in the morning.",
      "Mercedes islands (Apuao and nearby): boats leave from Mercedes port, about 30–45 minutes to the islands.",
      "The calmest sea is usually from March to June. The Coast Guard cancels trips in rough weather, so keep a spare day and follow your operator's advice.",
      CONFIRM,
    ].join(" "),
    links: [{ href: "/tours/browse?location=Calaguas", label: "Calaguas tours" }],
  },
];

/** Towns and ports the assistant can measure from, with approximate centers. */
export const TRANSPORT_PLACES: Array<{ name: string; aliases: string[]; point: LatLng }> = [
  { name: "Daet town center", aliases: ["daet", "daet town", "daet center", "town center", "poblacion", "daet plaza"], point: { lat: 14.1122, lng: 122.9553 } },
  { name: "Bagasbas", aliases: ["bagasbas"], point: { lat: 14.1316, lng: 122.9851 } },
  { name: "Mercedes port", aliases: ["mercedes", "mercedes port"], point: { lat: 14.1094, lng: 123.0108 } },
  { name: "Vinzons", aliases: ["vinzons", "vinzons port", "pinagtigasan"], point: { lat: 14.1736, lng: 122.9083 } },
  { name: "Paracale port", aliases: ["paracale", "paracale port"], point: { lat: 14.2797, lng: 122.7867 } },
  { name: "Talisay", aliases: ["talisay"], point: { lat: 14.1347, lng: 122.9258 } },
  { name: "Basud", aliases: ["basud"], point: { lat: 14.0644, lng: 122.9636 } },
  { name: "Labo", aliases: ["labo"], point: { lat: 14.1556, lng: 122.8317 } },
  { name: "Jose Panganiban", aliases: ["jose panganiban", "panganiban"], point: { lat: 14.2919, lng: 122.6936 } },
  { name: "Naga airport (Pili)", aliases: ["naga airport", "pili airport", "naga", "pili", "airport"], point: { lat: 13.5848, lng: 123.27 } },
];

/** Sea legs: no road route, so typical boat times from the curated table. */
export const BOAT_LEGS: Array<{ from: string; to: string; aliases: string[]; minutes: [number, number] }> = [
  { from: "Paracale port", to: "Calaguas", aliases: ["calaguas", "tinaga", "mahabang buhangin"], minutes: [120, 150] },
  { from: "Vinzons", to: "Calaguas", aliases: ["calaguas", "tinaga", "mahabang buhangin"], minutes: [90, 120] },
  { from: "Mercedes port", to: "Apuao Grande", aliases: ["apuao", "apuao grande", "mercedes islands", "canimog", "quinapaguian"], minutes: [30, 45] },
];

/** Lowercase words only, so "Bagasbas?" matches "bagasbas". */
const words = (value: string) => normalizeText(value).replace(/[:.,;!?-]/g, " ").replace(/\s+/g, " ").trim();
const has = (text: string, phrase: string) => ` ${text} `.includes(` ${phrase} `);

export function findTransportPlace(name: string) {
  const t = words(name);
  // Longest alias first, so "naga airport" beats "naga" and "daet plaza" beats "daet".
  const candidates = TRANSPORT_PLACES.flatMap((place) => place.aliases.map((alias) => ({ place, alias }))).sort((a, b) => b.alias.length - a.alias.length);
  return candidates.find(({ alias }) => has(t, alias))?.place ?? null;
}

export function findBoatLeg(from: string, to: string) {
  const origin = findTransportPlace(from);
  const dest = words(to);
  const forward = BOAT_LEGS.filter((leg) => leg.aliases.some((a) => has(dest, a)));
  if (forward.length === 0) {
    // Asked the other way round ("from Calaguas to Paracale").
    const back = words(from);
    const reverse = BOAT_LEGS.filter((leg) => leg.aliases.some((a) => has(back, a)));
    const port = findTransportPlace(to);
    return reverse.find((leg) => leg.from === port?.name) ?? null;
  }
  return forward.find((leg) => leg.from === origin?.name) ?? null;
}

/** All boat options to an island, for "how long to Calaguas?" without a starting port. */
export function boatOptionsTo(to: string) {
  const dest = words(to);
  return BOAT_LEGS.filter((leg) => leg.aliases.some((a) => has(dest, a)));
}

const FROM_TO = /\b(?:from|mula sa|galing sa|galing)\s+(.+?)\s+(?:to|going to|papunta sa|papuntang|hanggang sa|hanggang)\s+(.+)$/;

/** Reads "how long from A to B" in English or Taglish; null when it isn't a travel-time question. */
export function readTravelQuestion(text: string): { from: string | null; to: string } | null {
  const t = words(text);
  if (!/\b(how long|how far|how many hours|gaano katagal|gaano kalayo|ilang oras|ilang minuto|travel time|byahe|biyahe|distance)\b/.test(t)) return null;
  const pair = t.match(FROM_TO);
  if (pair) return { from: pair[1].trim(), to: pair[2].trim() };
  const only = t.match(/\b(?:to|papunta sa|papuntang|sa)\s+([a-z ]+?)$/);
  return only ? { from: null, to: only[1].trim() } : null;
}
