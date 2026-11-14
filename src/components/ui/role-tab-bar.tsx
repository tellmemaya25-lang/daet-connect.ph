"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { LineIcon, TabIcon } from "@/components/ui/icons";
import { LogoutButton } from "@/components/ui/logout-button";
import { ThemeChoices } from "@/components/ui/theme-toggle";
import { UnreadMessagesBadge } from "@/components/chat/unread-badge";
import { announceOverlay } from "@/lib/ui-overlay";
import { activeTab, type Tab } from "@/lib/tours/dashboards";

const TAB = "flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-xs font-bold transition active:scale-95";

/**
 * Bottom tab bar on phones for signed-in users; hidden from sm up, where the header has room.
 * With `account`, Tours moves into the Menu sheet and the last tab is "You": a sheet with the
 * theme choice and Sign out.
 */
export function RoleTabBar({ tabs, account = false }: { tabs: Tab[]; account?: boolean }) {
  const pathname = usePathname() ?? "";
  const shown = account ? tabs.filter((tab) => tab.href !== "/tours/browse") : tabs;
  const current = activeTab(shown, pathname);
  if (tabs.length === 0) return null;
  return (
    <nav
      aria-label="Dashboard"
      className="fixed inset-x-0 bottom-0 z-40 bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(15,23,42,0.08)] sm:hidden print:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {shown.map((tab) => {
          const active = tab.href === current;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`${TAB} ${active ? "text-blue-600 dark:text-blue-300" : "text-daet-ink/75 hover:text-daet-ink"}`}
              >
                <span className="relative">
                  <TabIcon label={tab.label} className="h-6 w-6" />
                  {tab.href === "/tours/messages" ? <UnreadMessagesBadge className="absolute -right-3 -top-1.5" /> : null}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
        {account ? (
          <li>
            <YouTab />
          </li>
        ) : null}
      </ul>
    </nav>
  );
}

function YouTab() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sheetId = useId();
  const pathname = usePathname() ?? "";

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    announceOverlay("menu", open);
    return () => announceOverlay("menu", false);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={sheetId}
        onClick={() => setOpen((value) => !value)}
        className={`${TAB} ${open ? "text-blue-600 dark:text-blue-300" : "text-daet-ink/75 hover:text-daet-ink"}`}
      >
        <span className={`grid h-6 w-6 place-items-center rounded-full bg-blue-600 text-white ${open ? "ring-2 ring-blue-600 ring-offset-2 ring-offset-surface" : ""}`}>
          <LineIcon name="user" className="h-4 w-4" />
        </span>
        You
      </button>
      {open ? (
        <div id={sheetId} role="group" aria-label="Your account" className="absolute inset-x-0 bottom-full rounded-t-2xl bg-surface px-4 pb-4 pt-3 shadow-[var(--shadow-float)]">
          <ThemeChoices />
          <div className="mt-3 px-3">
            <LogoutButton className="w-full justify-start border-0 bg-transparent px-0 text-base" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
