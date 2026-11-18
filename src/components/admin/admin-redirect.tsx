import { redirect } from "next/navigation";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Sends an admin from a shared signed-in page to its copy inside the admin shell, so an admin
 * keeps the sidebar and top bar. It reads the session, so mount it inside <Suspense>.
 * Renders nothing for everyone else.
 */
export async function AdminRedirect({ to }: { to: string }) {
  if (!isSupabaseConfigured()) return null;
  const session = await getAuthenticatedSession().catch(() => null);
  if (session?.user && session.role === "admin") redirect(to);
  return null;
}
