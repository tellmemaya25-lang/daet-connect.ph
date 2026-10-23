import type { SupabaseClient } from "@supabase/supabase-js";
import { addPoints, balanceOf, sourceLabel, TOURS_REWARD_RULES } from "@/lib/rewards";

const client = (result: { data: unknown; error: { message: string } | null }) => {
  const rpc = jest.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
};

describe("addPoints", () => {
  it("calls the idempotent RPC and reports whether points were new", async () => {
    const { client: c, rpc } = client({ data: true, error: null });
    await expect(addPoints(c, "user-1", 50, "tours.booking_paid", "booking-1", "Paid")).resolves.toEqual({ ok: true, awarded: true });
    expect(rpc).toHaveBeenCalledWith("rewards_add_points", { p_profile_id: "user-1", p_points: 50, p_source: "tours.booking_paid", p_ref_id: "booking-1", p_description: "Paid" });

    const repeat = client({ data: false, error: null });
    await expect(addPoints(repeat.client, "user-1", 50, "tours.booking_paid", "booking-1")).resolves.toEqual({ ok: true, awarded: false });
  });

  it("rejects bad input before touching the database", async () => {
    const { client: c, rpc } = client({ data: true, error: null });
    for (const args of [
      ["", 5, "tours.x", "r"],
      ["u", 0, "tours.x", "r"],
      ["u", 2.5, "tours.x", "r"],
      ["u", 5, "Tours X", "r"],
      ["u", 5, "tours.x", ""],
    ] as const) {
      expect((await addPoints(c, args[0], args[1], args[2], args[3])).ok).toBe(false);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("surfaces database errors", async () => {
    const { client: c } = client({ data: null, error: { message: "permission denied" } });
    await expect(addPoints(c, "u", 5, "tours.x", "r")).resolves.toEqual({ ok: false, error: "permission denied" });
  });
});

describe("helpers", () => {
  it("labels sources and sums balances", () => {
    expect(sourceLabel("tours.booking_paid")).toBe("Tour paid");
    expect(sourceLabel("merch.order_placed")).toBe("Order placed");
    expect(balanceOf([{ points: 50 }, { points: -50 }, { points: 30 }])).toBe(30);
  });
  it("tours rules match the plan", () => {
    expect(Object.fromEntries(TOURS_REWARD_RULES.map((r) => [r.source, r.points]))).toEqual({
      "tours.booking_paid": 50,
      "tours.checked_in": 30,
      "tours.tour_completed": 20,
      "tours.review_written": 10,
      "tours.itinerary_saved": 5,
    });
  });
});
