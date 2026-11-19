import { SWEEP_EVERY_MS, resetHoldSweepClock, sweepExpiredHolds } from "@/lib/tours/booking-holds";
import type { SupabaseClient } from "@supabase/supabase-js";

/** A stand-in supabase client that only answers the one RPC we call. */
function fakeClient(outcome: { data?: number; error?: { message: string } } | "throws") {
  const calls: unknown[] = [];
  const client = {
    rpc(name: string, args: unknown) {
      calls.push({ name, args });
      if (outcome === "throws") return Promise.reject(new Error("network down"));
      return Promise.resolve({
        data: outcome.data ?? null,
        error: outcome.error ?? null,
      });
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

beforeEach(() => resetHoldSweepClock());

describe("sweepExpiredHolds", () => {
  it("asks the database to expire holds and returns how many it released", async () => {
    const { client, calls } = fakeClient({ data: 3 });
    expect(await sweepExpiredHolds(client)).toBe(3);
    expect(calls).toEqual([{ name: "tours_expire_pending_holds", args: { p_limit: 200 } }]);
  });

  it("treats a missing migration or a database error as 'nothing released', never a crash", async () => {
    const { client } = fakeClient({ error: { message: "function does not exist" } });
    await expect(sweepExpiredHolds(client)).resolves.toBe(0);
  });

  it("survives the RPC throwing outright", async () => {
    const { client } = fakeClient("throws");
    await expect(sweepExpiredHolds(client)).resolves.toBe(0);
  });

  it("does not scan again within the throttle window", async () => {
    const first = fakeClient({ data: 1 });
    expect(await sweepExpiredHolds(first.client)).toBe(1);
    // A second page visit straight after must not hit the database again.
    const second = fakeClient({ data: 9 });
    expect(await sweepExpiredHolds(second.client)).toBe(0);
    expect(second.calls).toHaveLength(0);
  });

  it("sweeps again once the window has passed", async () => {
    const first = fakeClient({ data: 1 });
    await sweepExpiredHolds(first.client);

    const realNow = Date.now;
    Date.now = () => realNow() + SWEEP_EVERY_MS + 1;
    try {
      const second = fakeClient({ data: 2 });
      expect(await sweepExpiredHolds(second.client)).toBe(2);
      expect(second.calls).toHaveLength(1);
    } finally {
      Date.now = realNow;
    }
  });

  it("shares one run between callers that arrive together", async () => {
    const { client, calls } = fakeClient({ data: 4 });
    const [a, b] = await Promise.all([sweepExpiredHolds(client), sweepExpiredHolds(client)]);
    expect([a, b]).toEqual([4, 4]);
    expect(calls).toHaveLength(1);
  });
});
