"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { LineIcon } from "@/components/ui/icons";

export type MenuLink = { href: string; label: string };

/**
 * The phone menu: a 44px "Menu" button that opens a sheet of links. Built on
 * <details>, so it opens without JavaScript; it closes itself after navigation.
 */
export function MobileMenu({ groups }: { groups: Array<{ label: string; links: MenuLink[] }> }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);
  const visible = groups.filter((g) => g.links.length);
  if (!visible.length) return null;

  return (
    <details ref={ref} className="group md:hidden">
      <summary className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center gap-1.5 rounded-full px-3 text-sm font-bold text-daet-ink hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
        <LineIcon name="menu" className="h-6 w-6 group-open:hidden" />
        <LineIcon name="close" className="hidden h-6 w-6 group-open:block" />
        <span>Menu</span>
      </summary>
      <nav
        aria-label="Menu"
        className="absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-4.5rem)] overflow-y-auto bg-white px-4 pb-6 pt-2 shadow-[var(--shadow-float)]"
      >
        {visible.map((group) => (
          <div key={group.label} className="mt-3 first:mt-0">
            <p className="px-3 py-2 text-sm font-semibold text-daet-ink/70">{group.label}</p>
            <ul>
              {group.links.map((link) => {
                const current = pathname === link.href || (pathname ?? "").startsWith(`${link.href}/`);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={current ? "page" : undefined}
                      className={`flex min-h-12 items-center rounded-2xl px-3 text-lg font-semibold ${current ? "bg-blue-50 text-blue-700" : "text-daet-ink hover:bg-slate-100"}`}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </details>
  );
}
