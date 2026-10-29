"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TabIcon } from "@/components/ui/icons";
import { activeTab, type Tab } from "@/lib/tours/dashboards";

/** Bottom tab bar on phones for signed-in users; hidden from sm up, where the header has room. */
export function RoleTabBar({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname() ?? "";
  const current = activeTab(tabs, pathname);
  if (tabs.length === 0) return null;
  return (
    <nav
      aria-label="Dashboard"
      className="fixed inset-x-0 bottom-0 z-40 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(15,23,42,0.08)] sm:hidden print:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {tabs.map((tab) => {
          const active = tab.href === current;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-bold transition active:scale-95 ${active ? "text-blue-600" : "text-daet-ink/75 hover:text-daet-ink"}`}
              >
                <TabIcon label={tab.label} className="h-6 w-6" />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
