"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeTab, type Tab } from "@/lib/tours/dashboards";

/** Bottom tab bar on phones for signed-in users; hidden from sm up, where the header has room. */
export function RoleTabBar({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname() ?? "";
  const current = activeTab(tabs, pathname);
  if (tabs.length === 0) return null;
  return (
    <nav
      aria-label="Dashboard"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-daet-ink/10 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:hidden print:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {tabs.map((tab) => {
          const active = tab.href === current;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition ${active ? "text-daet-forest" : "text-daet-ink/70 hover:text-daet-ink"}`}
              >
                <span aria-hidden="true" className={`text-lg leading-none ${active ? "" : "opacity-70 grayscale"}`}>
                  {tab.icon}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
