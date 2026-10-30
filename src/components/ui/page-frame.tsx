import type { ReactNode } from "react";
import { AssistantWidget } from "@/components/assistant/assistant-widget";
import { ChatDock } from "@/components/chat-dock/chat-dock";
import { RoleTabBar } from "@/components/ui/role-tab-bar";
import { SiteFooter } from "@/components/ui/site-footer";
import { SiteHeader } from "@/components/ui/site-header";
import type { PhotoKey } from "@/lib/photo-credits";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { roleTabs } from "@/lib/tours/dashboards";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";

async function signedInRole(): Promise<string | null | undefined> {
  if (!isSupabaseConfigured()) return undefined;
  try {
    const session = await getAuthenticatedSession();
    if (!session.user) return undefined;
    return session.role ?? "tourist";
  } catch {
    return undefined;
  }
}

const isStaffRole = (role: string | null | undefined): role is "operator" | "guide" | "admin" =>
  role === "operator" || role === "guide" || role === "admin";

export async function PageFrame({
  children,
  adminNav = false,
  credits,
  bleed = false,
}: {
  children: ReactNode;
  adminNav?: boolean;
  /** Photos shown on the page, credited in the footer. */
  credits?: PhotoKey[];
  /** The page lays out its own full-width sections (public pages); no inner padding or max width. */
  bleed?: boolean;
}) {
  const role = await signedInRole();
  const tabs = role === undefined ? [] : roleTabs(role);
  const staff = isStaffRole(role);
  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-blue-600 focus:px-5 focus:py-3 focus:text-sm focus:font-bold focus:text-white"
      >
        Skip to main content
      </a>
      <SiteHeader showAdminLink={adminNav} signedIn={role !== undefined} role={isStaffRole(role) ? role : undefined} tabs={tabs} />
      <main
        id="main-content"
        tabIndex={-1}
        className={bleed ? "w-full outline-none" : "mx-auto w-full max-w-7xl px-4 py-6 outline-none sm:px-6 sm:py-10 lg:px-8"}
      >
        {children}
      </main>
      {/* Work screens (signed-in staff) get a one-line footer; everyone else gets the full close. */}
      <SiteFooter credits={credits} compact={staff} className={tabs.length ? "pb-24 sm:pb-10" : ""} />
      <RoleTabBar tabs={tabs} />
      <AssistantWidget signedIn={role !== undefined} raised={tabs.length > 0} />
      {role !== undefined ? <ChatDock /> : null}
    </div>
  );
}
