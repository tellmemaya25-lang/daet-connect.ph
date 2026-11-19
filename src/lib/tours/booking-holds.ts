import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Releasing unpaid bookings whose hold ran out (20261222).
 *
 * `tours_expire_pending_holds()` is the rule and does all the deciding: it only
 * cancels rows that are still `pending`, still unpaid, and past
 * `hold_expires_at`. So it is safe to call whenever, and from wherever — twice at
 * once does nothing extra.
 *
 * That matters because Vercel's Hobby plan allows only one cron run a day, and a
 * 2-hour hold cannot wait for it. So the pages that show a hold sweep as they are
 * visited. The cron endpoint stays as the guaranteed daily floor (and for any
 * scheduler that can do better).
 */

/** The oldest a sweep may be before a page bothers running another. */
export const SWEEP_EVERY_MS = 5 * 60 * 1000;

let lastSweepAt = 0;
let sweepInFlight: Promise<number> | null = null;

/**
 * Cancel unpaid bookings whose hold has expired. Returns how many were released.
 *
 * Best-effort and never throws: a booking page must render even when the sweep
 * cannot run, and the next sweep will catch whatever this one missed.
 */
export async function sweepExpiredHolds(supabase: SupabaseClient): Promise<number> {
  // Join a sweep already running before checking the clock, so two page loads at
  // the same moment share one run instead of the second one seeing "too soon".
  if (sweepInFlight) return sweepInFlight;

  const now = Date.now();
  // Not more often than every few minutes: a busy page would otherwise scan the
  // due-holds index on every render.
  if (now - lastSweepAt < SWEEP_EVERY_MS) return 0;

  lastSweepAt = now;
  sweepInFlight = (async () => {
    try {
      const { data, error } = await supabase.rpc("tours_expire_pending_holds", { p_limit: 200 });
      if (error) {
        // The migration may not be applied yet; that is not a page's problem.
        console.error("Hold sweep skipped:", error.message);
        return 0;
      }
      return typeof data === "number" ? data : 0;
    } catch (error) {
      console.error("Hold sweep failed:", error);
      return 0;
    } finally {
      sweepInFlight = null;
    }
  })();

  return sweepInFlight;
}

/** For tests: forget that a sweep just ran. */
export function resetHoldSweepClock() {
  lastSweepAt = 0;
  sweepInFlight = null;
}
