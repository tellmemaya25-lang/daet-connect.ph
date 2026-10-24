import type { ReactNode } from "react";
import { SiteHeader } from "@/components/ui/site-header";

export function PageFrame({
  children,
  adminNav = false,
}: {
  children: ReactNode;
  adminNav?: boolean;
}) {
  return (
    <div className="min-h-screen">
      <SiteHeader showAdminLink={adminNav} />
      <main className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        {children}
      </main>
      <footer className="mx-auto max-w-[1200px] px-4 pb-8 pt-2 text-xs text-daet-ink/55 sm:px-6 lg:px-8 print:hidden">
        CONNECT-DAET.ph · Tourism in Daet, Camarines Norte
      </footer>
    </div>
  );
}
