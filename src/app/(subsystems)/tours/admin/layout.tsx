import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { AdminShell } from "@/components/admin/admin-shell";
import { SIDEBAR_COOKIE } from "@/components/admin/nav";
import { PageFrame } from "@/components/ui/page-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";

/**
 * Admins get the admin shell. Everyone else (signed out, other roles, no Supabase)
 * gets the public frame around the page's own sign-in or access notice.
 * Each page still checks access itself: this only picks the frame.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = isSupabaseConfigured() ? await getAuthenticatedSession().catch(() => null) : null;
  if (!session?.user || session.role !== "admin") return <PageFrame>{children}</PageFrame>;
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";
  const meta = session.user.user_metadata as { full_name?: unknown } | undefined;
  const name = typeof meta?.full_name === "string" && meta.full_name ? meta.full_name : session.user.email ?? "Admin";
  return <AdminShell initialCollapsed={collapsed} name={name}>{children}</AdminShell>;
}
