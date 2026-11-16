import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { AdminShell } from "@/components/admin/admin-shell";
import { QUEUE_HREFS, SIDEBAR_COOKIE } from "@/components/admin/nav";
import { PageFrame, signedInViewer } from "@/components/ui/page-frame";
import { accountLinks, roleTabs } from "@/lib/tours/dashboards";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";

/** How many operators, guides and packages wait for the office. A failed count shows no badge. */
async function queueCounts(): Promise<Record<string, number>> {
  try {
    const supabase = await createSupabaseServerClient();
    const [operators, guides, packages] = await Promise.all([
      supabase
        .from("tours_operators")
        .select("*", { count: "exact", head: true })
        .eq("accreditation_status", "pending"),
      supabase
        .from("tours_guides")
        .select("*", { count: "exact", head: true })
        .eq("accreditation_status", "pending"),
      supabase
        .from("tours_packages")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending_review"),
    ]);
    const [o, g, p] = QUEUE_HREFS;
    return {
      [o]: operators.count ?? 0,
      [g]: guides.count ?? 0,
      [p]: packages.count ?? 0,
    };
  } catch {
    return {};
  }
}

/**
 * Admins get the admin shell. Everyone else (signed out, other roles, no Supabase)
 * gets the public frame around the page's own sign-in or access notice.
 * Each page still checks access itself: this only picks the frame.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = isSupabaseConfigured()
    ? await getAuthenticatedSession().catch(() => null)
    : null;
  if (!session?.user || session.role !== "admin")
    return <PageFrame>{children}</PageFrame>;
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";
  const [viewer, counts] = await Promise.all([signedInViewer(), queueCounts()]);
  const account = viewer ?? {
    initial: "A",
    name: session.user.email ?? "Admin",
    avatarUrl: null,
  };
  return (
    <AdminShell
      initialCollapsed={collapsed}
      counts={counts}
      account={account}
      accountLinks={accountLinks("admin", roleTabs("admin"))}
    >
      {children}
    </AdminShell>
  );
}
