import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { AdminShell } from "@/components/admin/admin-shell";
import { QUEUE_HREFS, SIDEBAR_COOKIE } from "@/components/admin/nav";
import { LiveProvider } from "@/components/live/live-provider";
import { RoleTabBar } from "@/components/ui/role-tab-bar";
import { RoleClaimSync } from "@/components/ui/role-claim-sync";
import { accountLinks, roleTabs } from "@/lib/tours/dashboards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { loadNotifications } from "@/lib/tours/notifications-server";

type Notifications = Awaited<ReturnType<typeof loadNotifications>>;

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
 * The admin sidebar and top bar around a page. The admin layout uses it for every admin page,
 * and PageFrame uses it for an admin on the signed-in pages they share with everyone
 * (messages, notifications, account), so an admin sees one frame everywhere.
 */
export async function AdminFrame({
  viewer,
  notifications,
  children,
}: {
  viewer: {
    initial: string;
    name: string;
    avatarUrl: string | null;
    role?: string;
    roleSource?: "claim" | "rpc";
  };
  notifications: Notifications;
  children: ReactNode;
}) {
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";
  const counts = await queueCounts();
  const content = (
    <>
      {/* Before the shell, so the menu drawer (same layer, later in the page) covers it. */}
      <RoleTabBar tabs={roleTabs("admin")} />
      <AdminShell
        initialCollapsed={collapsed}
        counts={counts}
        notifications={notifications}
        account={{
          initial: viewer.initial,
          name: viewer.name,
          avatarUrl: viewer.avatarUrl,
        }}
        accountLinks={accountLinks("admin", roleTabs("admin"))}
      >
        {children}
      </AdminShell>
      {viewer.roleSource === "claim" && viewer.role ? (
        <RoleClaimSync shownRole={viewer.role} />
      ) : null}
    </>
  );
  // The live poller feeds the bell, the unread-chat badge and the pages' live counts.
  return notifications ? (
    <LiveProvider initial={notifications}>{content}</LiveProvider>
  ) : (
    content
  );
}
