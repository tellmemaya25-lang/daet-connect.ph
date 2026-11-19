import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Release unpaid bookings whose hold ran out (20261222).
 *
 * A pending booking counts toward a date's capacity (tours_count_booked_seats),
 * so without this one abandoned checkout holds a date shut for good. The rule
 * itself lives in the database (tours_expire_pending_holds); this endpoint only
 * asks it to run, so it also works if the cron is late or missed a day.
 *
 * Scheduled by vercel.json (`/api/cron/booking-holds`, every 15 minutes).
 * Protected by CRON_SECRET: Vercel sends `Authorization: Bearer <secret>`.
 * With no secret configured the endpoint refuses rather than staying open,
 * because it cancels real bookings.
 *
 * No route segment config: this project runs with cacheComponents, which does not
 * allow `dynamic`. A GET handler that reads the request and calls the database is
 * never cached anyway.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return Response.json({ ok: false, message: "CRON_SECRET is not configured" }, { status: 503 });
  }

  const authorization = request.headers.get("authorization")?.trim();
  if (authorization !== `Bearer ${secret}`) {
    return Response.json({ ok: false, message: "Not authorized" }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc("tours_expire_pending_holds", { p_limit: 500 });
    if (error) {
      // The migration may not be applied yet; say so plainly rather than 500ing silently.
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
