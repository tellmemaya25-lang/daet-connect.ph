import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Release unpaid bookings whose hold ran out (20261222).
 *
 * A pending booking counts toward a date's capacity (tours_count_booked_seats),
 * so without this one abandoned checkout holds a date shut.
 *
 * The rule lives in the database (`tours_expire_pending_holds`), which only
 * cancels rows that are genuinely overdue and unpaid, so calling it too often or
 * twice at once is harmless. That is deliberate: this endpoint is a convenience
 * on top of an in-app sweep (see `sweepExpiredHolds` in
 * `src/lib/tours/booking-holds.ts`), not the only thing keeping holds moving.
 * Vercel's Hobby plan only allows one cron run a day, and a 2-hour hold cannot
 * wait for that — so the booking pages sweep as they are visited.
 *
 * Can be called by Vercel Cron (Authorization: Bearer <CRON_SECRET>) or by a
 * scheduler that sends the same header. With no secret configured the endpoint
 * refuses, because it cancels real bookings.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return Response.json({ ok: false, message: "CRON_SECRET is not configured" }, { status: 503 });
  }

  if (request.headers.get("authorization")?.trim() !== `Bearer ${secret}`) {
    return Response.json({ ok: false, message: "Not authorized" }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc("tours_expire_pending_holds", { p_limit: 500 });
    if (error) {
      console.error("Booking hold sweep failed:", error);
      return Response.json({ ok: false, message: error.message }, { status: 500 });
    }
    const expired = typeof data === "number" ? data : 0;
    if (expired > 0) console.info(`Released ${expired} unpaid booking hold(s).`);
    return Response.json({ ok: true, expired });
  } catch (error) {
    console.error("Booking hold sweep error:", error);
    return Response.json({ ok: false, message: "The sweep could not run" }, { status: 500 });
  }
}
