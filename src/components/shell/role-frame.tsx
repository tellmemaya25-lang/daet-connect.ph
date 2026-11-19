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
 * The sidebar, top bar and phone tab bar around a role's pages. AdminFrame, OperatorFrame and GuideFrame
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
  accountInTabBar = false,
  children,
}: {
  role: "admin" | "operator" | "guide";
  config: ShellConfig;
  viewer: FrameViewer;
  notifications: Awaited<ReturnType<typeof loadNotifications>>;
  counts?: Record<string, number>;
  search?: ReactNode;
  /** Opt-in: on phones the account menu is the tab bar's last item instead of the top bar's avatar. */
  accountInTabBar?: boolean;
  children: ReactNode;
}) {
  const collapsed = (await cookies()).get(config.cookie.name)?.value === "1";
  const tabs = roleTabs(role);
  const links = [...accountLinks(role, tabs), { href: "/", label: "View public site" }];
  const content = (
    <>
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
        accountLinks={links}
        accountInTabBar={accountInTabBar && tabs.length > 0}
      >
        {children}
      </AppShell>
      {/* After the shell, so its skip link is the first tab stop; one layer under
          the menu drawer (z-40), so the open drawer still covers the bar. */}
      <RoleTabBar
        tabs={tabs}
        belowOverlays
        account={
          accountInTabBar
            ? { initial: viewer.initial, name: viewer.name, avatarUrl: viewer.avatarUrl, links }
            : undefined
        }
      />
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
