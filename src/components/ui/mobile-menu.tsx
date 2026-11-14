"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { ThemeChoices } from "@/components/ui/theme-toggle";
import { announceOverlay } from "@/lib/ui-overlay";

export type MenuLink = { href: string; label: string };

/**
 * The phone menu: a 44px "Menu" button that opens a sheet of links. Built on
 * <details>, so it opens without JavaScript; it closes itself after navigation.
 * It always has the Theme choice at the bottom.
 */
export function MobileMenu({ groups }: { groups: Array<{ label: string; links: MenuLink[] }> }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);
  // Unmounting while open (no toggle event fires then) clears the overlay too.
  useEffect(() => () => announceOverlay("menu", false), []);
  const visible = groups.filter((g) => g.links.length);

  return (
    <details ref={ref} className="group md:hidden" onToggle={(event) => announceOverlay("menu", event.currentTarget.open)}>
      <summary className="grid min-h-11 min-w-11 cursor-pointer list-none place-items-center rounded-full bg-blue-50 text-blue-700 transition-[background-color,transform] active:scale-90 motion-reduce:transition-none dark:bg-blue-950/40 dark:text-blue-300 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="relative block h-3.5 w-5">
          <span className="absolute left-0 top-0 h-0.5 w-5 rounded-sm bg-current transition-[transform,top] duration-200 motion-reduce:transition-none group-open:top-1.5 group-open:rotate-45" />
          <span className="absolute left-0 top-1.5 h-0.5 w-5 origin-center rounded-sm bg-current transition-[transform,opacity] duration-150 motion-reduce:transition-none group-open:scale-x-[0.2] group-open:opacity-0" />
          <span className="absolute left-0 top-3 h-0.5 w-5 rounded-sm bg-current transition-[transform,top] duration-200 motion-reduce:transition-none group-open:top-1.5 group-open:-rotate-45" />
        </span>
        <span className="sr-only">Menu</span>
      </summary>
      <nav
        aria-label="Menu"
        className="absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-4.5rem)] overflow-y-auto bg-surface px-4 pb-6 pt-2 shadow-[var(--shadow-float)]"
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
                      className={`flex min-h-12 items-center rounded-2xl px-3 text-lg font-semibold ${current ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300" : "text-daet-ink hover:bg-muted"}`}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <ThemeChoices />
      </nav>
    </details>
  );
}
