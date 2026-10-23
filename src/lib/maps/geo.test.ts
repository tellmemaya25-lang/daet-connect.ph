import fc from "fast-check";
import {
  coordKey,
  decodePolyline,
  directionsUrl,
  estimateLeg,
  formatDistance,
  formatDuration,
  haversineMeters,
  isLatLng,
  projectPoints,
  routeTotals,
} from "@/lib/maps/geo";

const rizal = { lat: 14.1131, lng: 122.9545 };
const bagasbas = { lat: 14.131583, lng: 122.985083 };

describe("haversineMeters / estimateLeg", () => {
  it("matches known distances", () => {
    // Rizal Monument to Bagasbas Beach is about 3.9 km in a straight line.
    expect(haversineMeters(rizal, bagasbas)).toBeGreaterThan(3700);
    expect(haversineMeters(rizal, bagasbas)).toBeLessThan(4100);
    expect(haversineMeters(rizal, rizal)).toBe(0);
  });

  it("is symmetric and never negative (property)", () => {
    const point = fc.record({ lat: fc.double({ min: -80, max: 80, noNaN: true }), lng: fc.double({ min: -179, max: 179, noNaN: true }) });
    fc.assert(
      fc.property(point, point, (a, b) => {
        const ab = haversineMeters(a, b);
        expect(ab).toBeGreaterThanOrEqual(0);
        expect(Math.abs(ab - haversineMeters(b, a))).toBeLessThan(1e-6);
      }),
    );
  });

  it("estimates road distance and time", () => {
    const leg = estimateLeg(rizal, bagasbas);
    expect(leg.estimated).toBe(true);
    expect(leg.distanceM).toBe(Math.round(haversineMeters(rizal, bagasbas) * 1.4));
    expect(leg.durationS).toBe(Math.round(leg.distanceM / (30000 / 3600)));
  });
});

describe("decodePolyline", () => {
  it("decodes Google's documented example", () => {
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ]);
  });
});

describe("formatting and links", () => {
  it("formats distance and duration", () => {
    expect(formatDistance(850)).toBe("850 m");
    expect(formatDistance(5432)).toBe("5.4 km");
    expect(formatDistance(48210)).toBe("48 km");
    expect(formatDuration(30)).toBe("1 min");
    expect(formatDuration(1500)).toBe("25 min");
    expect(formatDuration(5400)).toBe("1 h 30 min");
    expect(formatDuration(7200)).toBe("2 h");
  });

  it("builds Google Maps links", () => {
    expect(directionsUrl([])).toBeNull();
    expect(directionsUrl([rizal])).toContain("query=14.1131%2C122.9545");
    const url = new URL(directionsUrl([rizal, { lat: 14.12, lng: 122.97 }, bagasbas])!);
    expect(url.searchParams.get("origin")).toBe("14.1131,122.9545");
    expect(url.searchParams.get("waypoints")).toBe("14.12,122.97");
    expect(url.searchParams.get("destination")).toBe("14.131583,122.985083");
  });

  it("keys, validates, totals and projects", () => {
    expect(coordKey(bagasbas)).toBe("14.13158,122.98508");
    expect(isLatLng({ lat: 91, lng: 0 })).toBe(false);
    expect(isLatLng({ lat: Number.NaN, lng: 0 })).toBe(false);
    expect(isLatLng(rizal)).toBe(true);
    expect(routeTotals([{ distanceM: 100, durationS: 10, polyline: null, estimated: false }, estimateLeg(rizal, bagasbas)]).estimated).toBe(true);
    const projected = projectPoints([rizal, bagasbas], 300, 200);
    for (const p of projected) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(300);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(200);
    }
    expect(projected[1].y).toBeLessThan(projected[0].y); // north is up
    expect(projectPoints([rizal], 300, 200)).toEqual([{ x: 150, y: 100 }]);
  });
});
