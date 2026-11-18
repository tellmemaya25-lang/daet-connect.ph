import type { ReactNode } from "react";
import { ADMIN_SHELL, QUEUE_HREFS } from "@/components/admin/nav";
import { AdminSearch } from "@/components/admin/admin-search";
import { RoleFrame, type FrameViewer } from "@/components/shell/role-frame";
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
  viewer: FrameViewer;
  notifications: Notifications;
  children: ReactNode;
}) {
  return (
    <RoleFrame
      role="admin"
      config={ADMIN_SHELL}
      viewer={viewer}
      notifications={notifications}
      counts={await queueCounts()}
      search={<AdminSearch />}
    >
      {children}
    </RoleFrame>
  );
}
