import { coordKey, estimateLeg } from "@/lib/maps/geo";
import { computeLegs, pairKey, parseDurationSeconds, type CachedLeg, type LegDeps } from "@/lib/maps/route-legs";

const a = { lat: 14.1131, lng: 122.9545 };
const b = { lat: 14.131583, lng: 122.985083 };
const c = { lat: 14.1136, lng: 123.0637 };
const now = new Date("2026-10-23T00:00:00Z");

function deps(overrides: Partial<LegDeps> = {}): LegDeps & { writes: unknown[] } {
  const writes: unknown[] = [];
  return {
    writes,
    readCache: async () => new Map(),
    writeCache: async (rows) => void writes.push(...rows),
    fetchLeg: async () => null,
    now: () => now,
    ...overrides,
  };
}

describe("computeLegs", () => {
  it("returns no legs for fewer than two points", async () => {
    expect(await computeLegs([a], "drive", deps())).toEqual([]);
  });

  it("uses fresh cache, calls the API for misses, and caches the answers", async () => {
    const cached = new Map<string, CachedLeg>([[pairKey(coordKey(a), coordKey(b)), { distance_m: 5200, duration_s: 600, polyline: "abc", fetched_at: "2026-10-20T00:00:00Z" }]]);
    const fetchLeg = jest.fn(async () => ({ distanceM: 9000, durationS: 900, polyline: "xyz", estimated: false }));
    const d = deps({ readCache: async () => cached, fetchLeg });
    const legs = await computeLegs([a, b, c], "drive", d);
    expect(legs).toEqual([
      { distanceM: 5200, durationS: 600, polyline: "abc", estimated: false },
      { distanceM: 9000, durationS: 900, polyline: "xyz", estimated: false },
    ]);
    expect(fetchLeg).toHaveBeenCalledTimes(1);
    expect(d.writes).toHaveLength(1);
  });

  it("refreshes stale cache, falls back to stale cache, then to the estimate", async () => {
    const stale = new Map<string, CachedLeg>([[pairKey(coordKey(a), coordKey(b)), { distance_m: 5100, duration_s: 610, polyline: null, fetched_at: "2026-01-01T00:00:00Z" }]]);
    const legs = await computeLegs([a, b, c], "drive", deps({ readCache: async () => stale, fetchLeg: async () => { throw new Error("quota"); } }));
    expect(legs[0]).toEqual({ distanceM: 5100, durationS: 610, polyline: null, estimated: false });
    expect(legs[1]).toEqual(estimateLeg(b, c));
  });

  it("survives a cache outage and repeated points", async () => {
    const legs = await computeLegs([a, a, b], "walk", deps({ readCache: async () => { throw new Error("down"); } }));
    expect(legs[0]).toEqual({ distanceM: 0, durationS: 0, polyline: null, estimated: false });
    expect(legs[1].estimated).toBe(true);
  });
});

describe("parseDurationSeconds", () => {
  it("reads Routes API durations", () => {
    expect(parseDurationSeconds("1234s")).toBe(1234);
    expect(parseDurationSeconds("12.6s")).toBe(13);
    expect(parseDurationSeconds("PT5M")).toBeNull();
    expect(parseDurationSeconds(5)).toBeNull();
  });
});
