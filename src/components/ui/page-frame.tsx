import type { ReactNode } from "react";
import { RoleTabBar } from "@/components/ui/role-tab-bar";
import { SiteHeader } from "@/components/ui/site-header";
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

export async function PageFrame({
  children,
  adminNav = false,
}: {
  children: ReactNode;
  adminNav?: boolean;
}) {
  const role = await signedInRole();
  const tabs = role === undefined ? [] : roleTabs(role);
  return (
    <div className="min-h-screen">
      <SiteHeader showAdminLink={adminNav} signedIn={role !== undefined} />
      <main className={`mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8 ${tabs.length ? "pb-24 sm:pb-12" : ""}`}>
        {children}
      </main>
      <footer className={`mx-auto max-w-7xl px-4 pt-2 text-xs text-daet-ink/55 sm:px-6 sm:pb-8 lg:px-8 print:hidden ${tabs.length ? "pb-24" : "pb-8"}`}>
        CONNECT-DAET.ph · Tourism in Daet, Camarines Norte
      </footer>
      <RoleTabBar tabs={tabs} />
    </div>
  );
}
