import { NextResponse } from "next/server";
import { loadLiveSummary } from "@/lib/live/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";


const HEADERS = { "Cache-Control": "no-store" };

/**
 * One poll for the header bell, the message badge and the dashboards' counts.
 * Reads the cookie session on the server, so it works when the browser's own
 * Supabase session is missing. `?visible=1` also stamps "last seen".
 */
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: HEADERS });
  const supabase = await createSupabaseServerClient();
  // getClaims verifies the session token locally against the project's cached
  // keys (refreshing it when expired); getUser() made a network call to
  // Supabase Auth on every poll. Row-level security still guards the data.
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub ?? null;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: HEADERS });

  const visible = new URL(request.url).searchParams.get("visible") === "1";
  // Presence and role don't depend on each other: one round trip, not two.
  const [, { data: role }] = await Promise.all([
    visible ? Promise.resolve(supabase.rpc("tours_touch_presence")).catch(() => null) : null,
    supabase.rpc("get_my_role"),
  ]);
  const normalized = typeof role === "string" ? role.trim().toLowerCase() : null;
  try {
    return NextResponse.json(await loadLiveSummary(supabase, userId, normalized), { headers: HEADERS });
  } catch (error) {
    console.error("Live summary error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "failed" }, { status: 500, headers: HEADERS });
  }
}
