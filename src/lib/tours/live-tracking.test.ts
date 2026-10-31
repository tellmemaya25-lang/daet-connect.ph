import { awaySince, DRIFT_ALERT_MS, driftAlert, initials, isStale, lastSeenLabel, pingMessage, shouldSend } from "@/lib/tours/live-tracking";

const at = (lat: number, lng: number, t: number) => ({ lat, lng, at: t });

describe("shouldSend", () => {
  it("sends the first fix, then every 20 s while still", () => {
    expect(shouldSend(null, at(14.1, 122.9, 0))).toBe(true);
    expect(shouldSend(at(14.1, 122.9, 0), at(14.1, 122.9, 15_000))).toBe(false);
    expect(shouldSend(at(14.1, 122.9, 0), at(14.1, 122.9, 20_000))).toBe(true);
  });

  it("sends sooner after moving 25 m, but not within the server's 10 s gap", () => {
    // 0.0005° latitude is about 55 m.
    expect(shouldSend(at(14.1, 122.9, 0), at(14.1005, 122.9, 5_000))).toBe(false);
    expect(shouldSend(at(14.1, 122.9, 0), at(14.1005, 122.9, 11_000))).toBe(true);
    expect(shouldSend(at(14.1, 122.9, 0), at(14.10005, 122.9, 11_000))).toBe(false);
  });
});

describe("staleness and labels", () => {
  const now = Date.parse("2026-11-01T03:00:00Z");
  it("counts a dot as paused after 2 minutes", () => {
    expect(isStale(now - 60_000, now)).toBe(false);
    expect(isStale(now - 120_000, now)).toBe(true);
  });
  it("says how long ago", () => {
    expect(lastSeenLabel(now - 20_000, now)).toBe("just now");
    expect(lastSeenLabel(now - 3 * 60_000, now)).toBe("3 min ago");
    expect(lastSeenLabel(now - 125 * 60_000, now)).toBe("2 h ago");
  });
});

describe("away-from-group alert", () => {
  it("starts timing past 300 m and alerts after 2 minutes", () => {
    const since = awaySince(null, 350, 1000);
    expect(since).toBe(1000);
    expect(awaySince(since, 400, 5000)).toBe(1000);
    expect(driftAlert(since, 1000 + DRIFT_ALERT_MS - 1)).toBe(false);
    expect(driftAlert(since, 1000 + DRIFT_ALERT_MS)).toBe(true);
  });
  it("resets when back in range or position unknown", () => {
    expect(awaySince(1000, 120, 5000)).toBeNull();
    expect(awaySince(1000, null, 5000)).toBeNull();
    expect(driftAlert(null, 10 ** 9)).toBe(false);
  });
});

describe("text helpers", () => {
  it("makes initials", () => {
    expect(initials("Ana Reyes")).toBe("AR");
    expect(initials("  maria  dela  cruz ")).toBe("MC");
    expect(initials("Jun")).toBe("J");
    expect(initials("")).toBe("?");
  });
  it("explains ping results", () => {
    expect(pingMessage("ok")).toBeNull();
    expect(pingMessage("throttled")).toBeNull();
    expect(pingMessage("no_consent")).toBe("Sharing is off.");
    expect(pingMessage("weird")).toMatch(/try again/);
  });
});
