/**
 * Scripted timeline for the live-tracking mockup (/mockups/live-tracking).
 * One sample booking: three guests ride the overnight bus from Manila to
 * Daet, meet their guide at Rizal Park, and tour Daet and Bagasbas. Times,
 * names and the bus drop-off point are samples; the place coordinates come
 * from the attractions seed. Nothing here touches real data.
 *
 * Time `t` is minutes since the bus leaves at 21:00.
 */
import { haversineMeters, type LatLng } from "@/lib/maps/geo";

export type Variant = "recommended" | "guide-only" | "full";
export type Phase = "travel" | "arrived" | "tour" | "ended";
export type GuestId = "ana" | "marco" | "lia";

const DEPART_CLOCK = 21 * 60;
/** t for a clock time on the morning after departure, e.g. at(8, 0) = 660. */
export const at = (hour: number, minute = 0) => hour * 60 + minute + (24 * 60 - DEPART_CLOCK);

export const T = {
  depart: 0,
  busArrive: at(6, 30),
  guideLive: at(7, 30),
  meet: at(8, 0),
  heritage: at(9, 10),
  ride: at(10, 10),
  bagasbas: at(10, 40),
  lunch: at(11, 30),
  lockStart: at(11, 0),
  lockEnd: at(11, 25),
  driftStart: at(12, 40),
  driftEnd: at(13, 10),
  separated: at(13, 30),
  reunited: at(13, 45),
  end: at(15, 0),
} as const;

export const DRIFT_ALERT_M = 300;
export const DRIFT_ALERT_MIN = 2;

export function clockLabel(t: number): string {
  const minutes = (((DEPART_CLOCK + Math.round(t)) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function durationLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  return m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function phaseAt(t: number): Phase {
  if (t >= T.end) return "ended";
  if (t >= T.meet) return "tour";
  if (t >= T.busArrive) return "arrived";
  return "travel";
}

/* ---------- Places ---------- */

export type Town = LatLng & { name: string };

/** The bus route, town by town (approximate town centres). */
export const BUS_ROUTE: Town[] = [
  { name: "Manila (PITX)", lat: 14.5096, lng: 120.9915 },
  { name: "Lucena", lat: 13.9373, lng: 121.617 },
  { name: "Gumaca", lat: 13.921, lng: 122.1002 },
  { name: "Calauag", lat: 13.9576, lng: 122.2881 },
  { name: "Santa Elena", lat: 14.1801, lng: 122.3925 },
  { name: "Labo", lat: 14.1563, lng: 122.8302 },
  { name: "Daet", lat: 14.1122, lng: 122.9553 },
];

export const PLACES = {
  busStop: { name: "Bus drop-off (sample point)", lat: 14.108, lng: 122.948 },
  rizalPark: { name: "First José Rizal Monument", lat: 14.1131, lng: 122.9545 },
  heritage: { name: "Daet Heritage Center and Museum", lat: 14.113187, lng: 122.954828 },
  bagasbas: { name: "Bagasbas Beach", lat: 14.131583, lng: 122.985083 },
} as const;

/** Road from town to the beach, drawn on the sketch (sample bends). */
export const BEACH_ROAD: LatLng[] = [PLACES.heritage, { lat: 14.118, lng: 122.963 }, { lat: 14.124, lng: 122.975 }, PLACES.bagasbas];

/** Rough coastline for the town sketch, west to east. */
export const COAST: LatLng[] = [
  { lat: 14.1402, lng: 122.944 },
  { lat: 14.1372, lng: 122.962 },
  { lat: 14.1336, lng: 122.978 },
  { lat: 14.1312, lng: 122.99 },
  { lat: 14.1292, lng: 122.998 },
];

export type Stop = { id: string; name: string; from: number; to: number; place: LatLng };

export const STOPS: Stop[] = [
  { id: "rizal", name: "First José Rizal Monument", from: T.meet, to: at(9, 0), place: PLACES.rizalPark },
  { id: "heritage", name: "Daet Heritage Center and Museum", from: T.heritage, to: T.ride, place: PLACES.heritage },
  { id: "bagasbas", name: "Bagasbas Beach, lunch at the beach eateries", from: T.bagasbas, to: T.end, place: PLACES.bagasbas },
];

export function stopIndexAt(t: number): number {
  for (let i = STOPS.length - 1; i >= 0; i--) if (t >= STOPS[i].from) return i;
  return -1;
}

/* ---------- Paths ---------- */

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const lerpPoint = (a: LatLng, b: LatLng, f: number): LatLng => ({ lat: lerp(a.lat, b.lat, f), lng: lerp(a.lng, b.lng, f) });
const clamp01 = (f: number) => Math.min(1, Math.max(0, f));

/** The point a fraction `f` of the way along a path, by distance. */
export function alongPath(path: LatLng[], f: number): LatLng {
  if (path.length === 1) return path[0];
  const lengths = path.slice(1).map((p, i) => haversineMeters(path[i], p));
  let remaining = clamp01(f) * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] || i === lengths.length - 1) return lerpPoint(path[i], path[i + 1], lengths[i] ? Math.min(1, remaining / lengths[i]) : 1);
    remaining -= lengths[i];
  }
  return path[path.length - 1];
}

/** A small shift in metres, so people standing together don't share one dot. */
const shift = (p: LatLng, northM: number, eastM: number): LatLng => ({
  lat: p.lat + northM / 111_320,
  lng: p.lng + eastM / (111_320 * Math.cos((p.lat * Math.PI) / 180)),
});

/** The guide, from 30 minutes before the meeting until the tour ends. */
export function guidePosition(t: number): LatLng | null {
  if (t < T.guideLive || t >= T.end) return null;
  if (t < at(9, 0)) return PLACES.rizalPark;
  if (t < T.heritage) return lerpPoint(PLACES.rizalPark, PLACES.heritage, (t - at(9, 0)) / (T.heritage - at(9, 0)));
  if (t < T.ride) return PLACES.heritage;
  if (t < T.bagasbas) return alongPath(BEACH_ROAD, (t - T.ride) / (T.bagasbas - T.ride));
  // On the beach: a slow walk east and back.
  const f = (t - T.bagasbas) / (T.end - T.bagasbas);
  return shift(PLACES.bagasbas, -10 * Math.sin(f * Math.PI * 2), 180 * Math.sin(f * Math.PI));
}

const GROUP_OFFSET: Record<GuestId, [number, number]> = { ana: [40, -38], marco: [-38, 42], lia: [10, 60] };

/** Where a guest really is (what full tracking would show). */
export function truePosition(id: GuestId, t: number): LatLng {
  if (t < T.busArrive) return alongPath(BUS_ROUTE, t / T.busArrive);
  if (t < at(7, 0)) return PLACES.busStop;
  if (t < at(7, 40)) return lerpPoint(PLACES.busStop, PLACES.rizalPark, (t - at(7, 0)) / 40);
  const guide = guidePosition(t) ?? PLACES.rizalPark;
  const [n, e] = GROUP_OFFSET[id];
  let p = shift(guide, n, e);
  if (id === "marco" && t >= T.driftStart && t < T.driftEnd) {
    // Wanders about 380 m along the beach, then comes back.
    const f = (t - T.driftStart) / (T.driftEnd - T.driftStart);
    p = shift(p, -20 * Math.sin(f * Math.PI), -380 * Math.sin(f * Math.PI));
  }
  if (id === "lia" && t >= T.separated - 20 && t < T.reunited) {
    const f = t < T.separated ? (t - (T.separated - 20)) / 20 : 1 - (t - T.separated) / (T.reunited - T.separated);
    p = shift(p, -30 * f, 520 * f);
  }
  return p;
}

export function nearestTown(p: LatLng): Town {
  return BUS_ROUTE.reduce((best, town) => (haversineMeters(p, town) < haversineMeters(p, best) ? town : best));
}

/* ---------- What each person shares ---------- */

export type Guest = { id: GuestId; name: string; initials: string; checkIn: number };

export const GUESTS: Guest[] = [
  { id: "ana", name: "Ana Reyes", initials: "AR", checkIn: at(7, 58) },
  { id: "marco", name: "Marco Reyes", initials: "MR", checkIn: at(7, 58) },
  { id: "lia", name: "Lia Santos", initials: "LS", checkIn: at(8, 6) },
];

/** Recommended: each guest decides. Ana shares the trip and the tour, Marco only the tour, Lia nothing. */
const CONSENT: Record<GuestId, { trip: boolean; tour: boolean }> = {
  ana: { trip: true, tour: true },
  marco: { trip: false, tour: true },
  lia: { trip: false, tour: false },
};

/** Guide only: tourists tap a status instead of sharing a location. */
const TAPPED_UPDATES: Record<GuestId, Array<{ t: number; text: string }>> = {
  ana: [
    { t: 5, text: "Left Manila" },
    { t: T.busArrive + 4, text: "Arrived in Daet" },
  ],
  marco: [{ t: T.busArrive + 6, text: "Arrived in Daet" }],
  lia: [],
};

export type Mode = "precise" | "town" | "paused" | "off" | "updates";

export type GuestView = Guest & {
  mode: Mode;
  /** Shown on the map, if anything. */
  position: LatLng | null;
  /** Plain-language line for the guest list. */
  detail: string;
  checkedIn: boolean;
  /** The one-shot location sent with "I'm separated". */
  flare: LatLng | null;
};

export type Events = { manualSeparated: { id: GuestId; t: number } | null; foundAt: number | null; anaLockedAt: number | null };

export const NO_EVENTS: Events = { manualSeparated: null, foundAt: null, anaLockedAt: null };

/**
 * When a guest's open "I'm separated" alert was sent, if one is open. Lia's
 * is scripted at 13:30 and closes when she is back at 13:45; the manual one
 * stays open until the guide marks the guest found or the tour ends.
 */
export function separationAt(id: GuestId, t: number, events: Events): number | null {
  if (t >= T.end) return null;
  const scripted = id === "lia" && t >= T.separated && t < T.reunited ? T.separated : null;
  const manual = events.manualSeparated?.id === id && t >= events.manualSeparated.t ? events.manualSeparated.t : null;
  const latest = Math.max(scripted ?? -1, manual ?? -1);
  if (latest < 0) return null;
  if (events.foundAt !== null && events.foundAt >= latest && t >= events.foundAt) return null;
  return latest;
}

/** When Ana's phone locked, if it is locked at `t`: scripted 11:00–11:25, or the manual toggle. */
function lockedSince(id: GuestId, t: number, events: Events): number | null {
  if (id !== "ana") return null;
  if (t >= T.lockStart && t < T.lockEnd) return T.lockStart;
  if (events.anaLockedAt !== null && t >= events.anaLockedAt) return events.anaLockedAt;
  return null;
}

export function guestView(guest: Guest, t: number, variant: Variant, events: Events): GuestView {
  const phase = phaseAt(t);
  const checkedIn = t >= guest.checkIn && phase !== "ended";
  const separatedAt = separationAt(guest.id, t, events);
  const flare = separatedAt !== null ? truePosition(guest.id, separatedAt) : null;
  const base = { ...guest, checkedIn, flare };

  if (phase === "ended") return { ...base, mode: "off", position: null, detail: "Tour ended. Location deleted." };

  const toDaet = durationLabel(T.busArrive - t);
  if (variant === "full") {
    const since = lockedSince(guest.id, t, events);
    if (since !== null) return { ...base, mode: "paused", position: truePosition(guest.id, since), detail: `Paused, last seen ${clockLabel(since)}` };
    const p = truePosition(guest.id, t);
    return { ...base, mode: "precise", position: p, detail: phase === "travel" ? `On the bus near ${nearestTown(p).name}, ${toDaet} to Daet` : "Live" };
  }

  if (variant === "guide-only") {
    const last = TAPPED_UPDATES[guest.id].filter((u) => u.t <= t).at(-1);
    if (checkedIn) return { ...base, mode: "updates", position: null, detail: `Checked in ${clockLabel(guest.checkIn)}` };
    return { ...base, mode: "updates", position: null, detail: last ? `${last.text}, ${clockLabel(last.t)}` : "No update yet" };
  }

  const consent = CONSENT[guest.id];
  if (phase === "travel" || phase === "arrived") {
    if (!consent.trip) return { ...base, mode: "off", position: null, detail: checkedIn ? `Checked in ${clockLabel(guest.checkIn)}` : consent.tour ? "Shares from the meeting time" : "Not sharing" };
    const town = phase === "travel" ? nearestTown(truePosition(guest.id, t)) : BUS_ROUTE[BUS_ROUTE.length - 1];
    return { ...base, mode: "town", position: town, detail: phase === "travel" ? `Near ${town.name}, ${toDaet} to Daet` : "In Daet" };
  }
  if (!consent.tour) return { ...base, mode: "off", position: null, detail: checkedIn ? `Not sharing. Checked in ${clockLabel(guest.checkIn)}` : "Not sharing" };
  const since = lockedSince(guest.id, t, events);
  if (since !== null) {
    return { ...base, mode: "paused", position: truePosition(guest.id, since), detail: `Paused (phone locked), last seen ${clockLabel(since)}` };
  }
  return { ...base, mode: "precise", position: truePosition(guest.id, t), detail: "Live" };
}

/* ---------- Alerts ---------- */

export type Alert = { id: string; tone: "danger" | "warning" | "info"; title: string; body: string };

export function alertsAt(t: number, variant: Variant, events: Events): Alert[] {
  const alerts: Alert[] = [];
  for (const guest of GUESTS) {
    const separated = separationAt(guest.id, t, events);
    if (separated === null) continue;
    alerts.push({
      id: `sep-${guest.id}-${separated}`,
      tone: "danger",
      title: `${guest.name} tapped “I'm separated”`,
      body: `Sent ${clockLabel(separated)} with their location at that moment. Call them, or walk to the red pin.`,
    });
  }
  const marco = guestView(GUESTS[1], t, variant, events);
  const guide = guidePosition(t);
  if (marco.mode === "precise" && guide && marco.position) {
    // Count how long Marco has been out of range, minute by minute.
    let outFor = 0;
    for (let m = Math.floor(t); m > Math.floor(t) - 10; m--) {
      const g = guidePosition(m);
      if (!g || haversineMeters(truePosition("marco", m), g) <= DRIFT_ALERT_M) break;
      outFor++;
    }
    if (outFor >= DRIFT_ALERT_MIN) {
      alerts.push({ id: "drift", tone: "warning", title: "Marco Reyes is away from the group", body: `About ${Math.round(haversineMeters(marco.position, guide) / 10) * 10} m from you for ${outFor}+ min.` });
    }
  }
  const ana = guestView(GUESTS[0], t, variant, events);
  if (ana.mode === "paused") alerts.push({ id: "paused", tone: "info", title: "Ana Reyes's location paused", body: `Her phone locked or she left the page. ${ana.detail.replace(/^Paused \(phone locked\), /, "Last seen ").replace(/^Paused, /, "Last seen ")}.` });
  return alerts;
}

/* ---------- Narration ---------- */

export function narrationAt(t: number, variant: Variant): string[] {
  const phase = phaseAt(t);
  const lines: string[] = [];
  if (phase === "travel") {
    lines.push(`The guests are on the overnight bus from Manila, due in Daet at ${clockLabel(T.busArrive)}.`);
    if (variant === "recommended") lines.push("Ana chose to share her trip, so the guide and operator see the nearest town and the time left, never her exact spot. Marco and Lia didn't.");
    if (variant === "guide-only") lines.push("No one is tracked. Guests can tap “Left Manila” or “Arrived in Daet” to update the guide.");
    if (variant === "full") lines.push("Every guest's exact position is visible all night. That is more than the guide needs and drains phones on a 9-hour ride.");
  } else if (phase === "arrived") {
    lines.push(`The bus has arrived. The tour meets at the First José Rizal Monument at ${clockLabel(T.meet)}.`);
    if (t >= T.guideLive) lines.push("The guide started live sharing 30 minutes before the meeting, so guests can find them.");
  } else if (phase === "tour") {
    const stop = STOPS[stopIndexAt(t)];
    lines.push(stop && t < stop.to ? `At stop ${stopIndexAt(t) + 1} of ${STOPS.length}: ${stop.name}.` : "Moving to the next stop.");
    if (variant === "recommended") lines.push("Ana and Marco share their live location until the tour ends. Lia doesn't; the guide still sees that she checked in.");
    if (variant === "guide-only") lines.push("Only the guide's dot is live. Away-from-group alerts can't work without guest locations; “I'm separated” still can.");
    if (variant === "full") lines.push("Everyone is visible, including Lia, who never agreed. Under the Data Privacy Act this needs her clear consent.");
    if (t >= T.lockStart && t < T.lockEnd) lines.push("Ana's phone locked. A website can't share in the background, so her dot freezes and shows when it was last updated.");
    if (t >= T.driftStart && t < T.driftEnd) lines.push(`Marco wandered off along the beach. When he's more than ${DRIFT_ALERT_M} m away for ${DRIFT_ALERT_MIN} minutes, the guide gets an alert.`);
    if (t >= T.separated && t < T.reunited) lines.push("Lia tapped “I'm separated”. That sends her location once, even though she isn't sharing, plus a call link.");
  } else {
    lines.push("The guide ended the tour. Every guest's live location is deleted and sharing stops on their phones.");
  }
  return lines;
}

/* ---------- Sample tours on the operator's board ---------- */

export const OTHER_TOURS = [
  { id: "calaguas", title: "Calaguas Islands day trip", guide: "Rina (sample)", guests: 6, status: "On the boat back", sharing: "4 of 6 sharing" },
  { id: "heritage-walk", title: "Daet heritage walk", guide: "Paolo (sample)", guests: 4, status: "Stop 2 of 3", sharing: "2 of 4 sharing" },
];
