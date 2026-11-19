import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { AppShell } from "@/components/shell/app-shell";
import type { ShellConfig } from "@/components/shell/nav";
import { LiveProvider } from "@/components/live/live-provider";
import { RoleTabBar } from "@/components/ui/role-tab-bar";
import { RoleClaimSync } from "@/components/ui/role-claim-sync";
import { accountLinks, roleTabs } from "@/lib/tours/dashboards";
import type { loadNotifications } from "@/lib/tours/notifications-server";

export type FrameViewer = {
  initial: string;
  name: string;
  avatarUrl: string | null;
  role?: string;
  roleSource?: "claim" | "rpc";
};

/**
 * The sidebar, top bar and phone tab bar around a role's pages. AdminFrame and OperatorFrame
 * supply the role's config (and, for admins, the waiting-item counts); a new role's shell
 * is a config and a thin frame like theirs.
 */
export async function RoleFrame({
  role,
  config,
  viewer,
  notifications,
  counts = {},
  search,
  children,
}: {
  role: "admin" | "operator";
  config: ShellConfig;
  viewer: FrameViewer;
  notifications: Awaited<ReturnType<typeof loadNotifications>>;
  counts?: Record<string, number>;
  search?: ReactNode;
  children: ReactNode;
}) {
  const collapsed = (await cookies()).get(config.cookie.name)?.value === "1";
  const tabs = roleTabs(role);
  const content = (
    <>
      {/* Before the shell, so the menu drawer (same layer, later in the page) covers it. */}
      <RoleTabBar tabs={tabs} />
      <AppShell
        config={config}
        search={search}
        initialCollapsed={collapsed}
        counts={counts}
        notifications={notifications}
        account={{
          initial: viewer.initial,
          name: viewer.name,
          avatarUrl: viewer.avatarUrl,
        }}
        accountLinks={accountLinks(role, tabs)}
      >
        {children}
      </AppShell>
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
