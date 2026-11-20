import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Mark finished tours completed (20261224_auto_complete_past_bookings).
 *
 * The rule lives in `tours_complete_past_bookings`: confirmed, fully paid,
 * not called off, and the tour's last day is before today in Manila. Unpaid,
 * partly paid and called-off bookings are left for the operator.
 *
 * Vercel Cron calls this once a day (vercel.json) with
 * Authorization: Bearer <CRON_SECRET>. Without a secret it refuses.
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
    const { data, error } = await supabase.rpc("tours_complete_past_bookings", { p_limit: 500 });
    if (error) {
      console.error("Auto-complete sweep failed:", error);
      return Response.json({ ok: false, message: error.message }, { status: 500 });
    }
    const completed = typeof data === "number" ? data : 0;
    if (completed > 0) console.info(`Marked ${completed} past booking(s) completed.`);
    return Response.json({ ok: true, completed });
  } catch (error) {
    console.error("Auto-complete sweep error:", error);
    return Response.json({ ok: false, message: "The sweep could not run" }, { status: 500 });
  }
}
