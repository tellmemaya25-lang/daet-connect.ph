import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { safeNextPath } from "@/lib/safe-redirect";

/**
 * Landing point for links in Supabase emails (password reset). Exchanges the
 * one-time code for a session, then sends the visitor to a same-site page.
 * Add `<site url>/auth/callback` to the project's allowed redirect URLs.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"), "/");
  const code = searchParams.get("code");

  if (code && isSupabaseConfigured()) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, origin));
    } catch {
      // Fall through to the expired-link message.
    }
  }

  return NextResponse.redirect(
    new URL(`/forgot-password?message=${encodeURIComponent("That link has expired. Request a new one.")}`, origin),
  );
}
