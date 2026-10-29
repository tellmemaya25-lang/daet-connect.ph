import { BUSY_LABELS, isBusyReason, scheduleErrorMessage, validateSwapReason } from "@/lib/tours/guide-swap";

describe("guide swaps (R6)", () => {
  it("turns database rule codes into plain messages", () => {
    expect(scheduleErrorMessage({ message: "guide_schedule:already_booked" })).toMatch(/another tour that day/);
    expect(scheduleErrorMessage({ message: "guide_schedule:not_available" })).toMatch(/hasn't marked the tour date/);
    expect(scheduleErrorMessage({ message: "guide_schedule:booked_that_day" })).toMatch(/Suggest another guide/);
    expect(scheduleErrorMessage({ message: "swap:already_pending" })).toMatch(/already a swap request/);
    expect(scheduleErrorMessage({ message: "duplicate key value" })).toBeNull();
    expect(scheduleErrorMessage(null)).toBeNull();
  });

  it("validates the reason", () => {
    expect(validateSwapReason("  Family   emergency ")).toEqual({ ok: true, reason: "Family emergency" });
    expect(validateSwapReason("no")).toMatchObject({ ok: false });
    expect(validateSwapReason("x".repeat(301))).toMatchObject({ ok: false });
    expect(validateSwapReason(undefined)).toMatchObject({ ok: false });
  });

  it("knows the busy reasons", () => {
    expect(isBusyReason("already_booked")).toBe(true);
    expect(isBusyReason("whatever")).toBe(false);
    expect(Object.keys(BUSY_LABELS)).toHaveLength(3);
  });
});
