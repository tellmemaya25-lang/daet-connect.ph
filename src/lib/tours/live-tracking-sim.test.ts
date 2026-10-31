import { haversineMeters } from "@/lib/maps/geo";
import { GUESTS, NO_EVENTS, PLACES, T, alertsAt, at, clockLabel, guestView, guidePosition, phaseAt, separationAt } from "@/lib/tours/live-tracking-sim";

const [ana, marco, lia] = GUESTS;

describe("live tracking mockup timeline", () => {
  it("maps clock times to minutes since the 21:00 bus", () => {
    expect(at(8, 0)).toBe(660);
    expect(clockLabel(0)).toBe("21:00");
    expect(clockLabel(T.end)).toBe("15:00");
    expect([phaseAt(10), phaseAt(T.busArrive), phaseAt(T.meet), phaseAt(T.end)]).toEqual(["travel", "arrived", "tour", "ended"]);
  });

  it("shares only the nearest town on the bus, and only for guests who agreed", () => {
    const onBus = guestView(ana, 300, "recommended", NO_EVENTS);
    expect(onBus.mode).toBe("town");
    expect(onBus.detail).toMatch(/^Near /);
    expect(guestView(marco, 300, "recommended", NO_EVENTS).position).toBeNull();
    expect(guestView(lia, at(12), "recommended", NO_EVENTS).mode).toBe("off");
    expect(guestView(marco, at(12), "recommended", NO_EVENTS).mode).toBe("precise");
  });

  it("guide only never shows a guest position", () => {
    for (const t of [100, T.busArrive + 10, at(12)]) for (const g of GUESTS) expect(guestView(g, t, "guide-only", NO_EVENTS).position).toBeNull();
  });

  it("freezes a locked phone at the time it locked", () => {
    const view = guestView(ana, T.lockStart + 10, "recommended", NO_EVENTS);
    expect(view.mode).toBe("paused");
    expect(view.detail).toContain(clockLabel(T.lockStart));
    const manual = { ...NO_EVENTS, anaLockedAt: at(12) };
    expect(guestView(ana, at(12, 20), "recommended", manual).position).toEqual(guestView(ana, at(12), "recommended", NO_EVENTS).position);
  });

  it("raises the away-from-group alert only after 2 minutes beyond 300 m", () => {
    const g = guidePosition(T.driftStart + 12)!;
    expect(g).not.toBeNull();
    expect(alertsAt(T.driftStart + 1, "recommended", NO_EVENTS).some((a) => a.id === "drift")).toBe(false);
    expect(alertsAt(T.driftStart + 12, "recommended", NO_EVENTS).some((a) => a.id === "drift")).toBe(true);
    expect(alertsAt(T.driftStart + 12, "guide-only", NO_EVENTS).some((a) => a.id === "drift")).toBe(false);
  });

  it("sends a one-time pin for “I'm separated”, even without sharing, and clears it when found", () => {
    const view = guestView(lia, T.separated + 2, "recommended", NO_EVENTS);
    expect(view.mode).toBe("off");
    expect(view.flare).not.toBeNull();
    expect(haversineMeters(view.flare!, PLACES.bagasbas)).toBeLessThan(1500);
    expect(separationAt("lia", T.separated + 5, { ...NO_EVENTS, foundAt: T.separated + 3 })).toBeNull();
    expect(separationAt("ana", at(12), { ...NO_EVENTS, manualSeparated: { id: "ana", t: at(11, 50) } })).toBe(at(11, 50));
  });

  it("deletes every location when the tour ends", () => {
    for (const g of GUESTS) expect(guestView(g, T.end, "full", NO_EVENTS).position).toBeNull();
    expect(guidePosition(T.end)).toBeNull();
  });
});
