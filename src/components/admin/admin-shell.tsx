"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LineIcon } from "@/components/ui/icons";
import { AccountMenu, type AccountLink } from "@/components/ui/account-menu";
import { cn } from "@/components/ui/cn";
import { NotificationBell } from "@/components/tours/notification-bell";
import { UnreadMessagesBadge } from "@/components/chat/unread-badge";
import type { LoadedNotifications } from "@/lib/tours/notifications-server";
import { AdminSearch } from "./admin-search";
import {
  ADMIN_GROUPS,
  COLLAPSIBLE_GROUP,
  SIDEBAR_COOKIE,
  areaFor,
} from "./nav";

function NavLinks({
  pathname,
  counts,
  collapsed = false,
  onNavigate,
}: {
  pathname: string;
  counts: Record<string, number>;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const current = areaFor(pathname);
  // The Content group folds away on request; it stays open while one of its pages is current.
  const [contentOpen, setContentOpen] = useState<boolean | undefined>(
    undefined,
  );
  return (
    <div className="flex flex-col gap-4">
      {ADMIN_GROUPS.map((g, i) => {
        const foldable = g.title === COLLAPSIBLE_GROUP && !collapsed;
        const hasCurrent = g.areas.some((a) => a.href === current?.href);
        const open = !foldable || (contentOpen ?? hasCurrent);
        const listId = `admin-nav-${g.title.toLowerCase()}`;
        return (
          <div
            key={g.title}
            className={cn(
              "flex flex-col gap-1",
              i > 0 && "border-t border-line pt-4",
            )}
          >
            {collapsed ? null : foldable ? (
              <button
                type="button"
                aria-expanded={open}
                aria-controls={listId}
                onClick={() => setContentOpen(!open)}
                className="flex min-h-11 items-center justify-between gap-2 rounded-xl px-3 text-left text-sm font-bold text-daet-ink hover:bg-surface"
              >
                {g.title}
                <LineIcon
                  name="chevron-down"
                  className={cn(
                    "h-4 w-4 transition-transform",
                    open && "rotate-180",
                  )}
                />
              </button>
            ) : (
              <p className="px-3 pb-1 text-sm font-bold text-daet-ink/80">
                {g.title}
              </p>
            )}
            <ul
              id={listId}
              className={cn("flex flex-col gap-1", !open && "hidden")}
            >
              {g.areas.map((a) => {
                const on = current?.href === a.href;
                const count = counts[a.href] ?? 0;
                const waiting = count > 0 ? `${count} waiting` : "";
                return (
                  <li key={a.href}>
                    <Link
                      href={a.href}
                      onClick={onNavigate}
                      aria-current={on ? "page" : undefined}
                      aria-label={
                        waiting ? `${a.label}, ${waiting}` : undefined
                      }
                      title={
                        collapsed
                          ? waiting
                            ? `${a.label} (${waiting})`
                            : a.label
                          : undefined
                      }
                      className={cn(
                        "relative flex min-h-11 items-center gap-3 rounded-xl border px-3 text-sm font-bold",
                        on
                          ? "border-line bg-surface text-daet-ink"
                          : "border-transparent text-daet-ink hover:border-line hover:bg-surface",
                        collapsed && "justify-center px-0",
                      )}
                    >
                      {on ? (
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-2 h-6 w-1 rounded-r bg-blue-600"
                        />
                      ) : null}
                      <LineIcon name={a.icon} className="h-5 w-5 flex-none" />
                      {collapsed ? (
                        <span className="sr-only">{a.label}</span>
                      ) : (
                        <span className="flex-1 truncate">{a.label}</span>
                      )}
                      {count > 0 ? (
                        <span
                          aria-hidden="true"
                          className={cn(
                            "rounded-full bg-amber-400/50 text-center font-bold leading-5 text-daet-ink",
                            collapsed
                              ? "absolute right-0.5 top-0.5 min-w-[18px] text-xs leading-4"
                              : "min-w-6 px-2 text-sm",
                          )}
                        >
                          {count}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/tours/admin"
      className={cn(
        "flex min-h-11 min-w-0 flex-col justify-center whitespace-nowrap leading-[1.1] text-daet-ink",
        className,
      )}
    >
      <span className="font-serif text-lg font-semibold">CONNECT-DAET</span>
      <span className="text-xs font-bold tracking-[0.14em] text-daet-ink/80">
        TOURISM
      </span>
    </Link>
  );
}

/**
 * The admin shell: sidebar, top bar and, on phones, a header with a menu drawer.
 * The sidebar collapses only from its button (remembered in a cookie); the top bar never hides on scroll.
 */
export function AdminShell({
  children,
  initialCollapsed,
  account,
  accountLinks,
  counts,
  notifications,
}: {
  children: ReactNode;
  initialCollapsed: boolean;
  account: { initial: string; name: string; avatarUrl: string | null };
  accountLinks: AccountLink[];
  counts: Record<string, number>;
  notifications: LoadedNotifications | null;
}) {
  const pathname = usePathname() ?? "/tours/admin";
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [drawer, setDrawer] = useState(false);
  // The drawer stays mounted for the length of its slide-out, then goes.
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const closeDrawer = useCallback(() => {
    setClosing(true);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setDrawer(false);
      setClosing(false);
    }, 240);
  }, []);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeDrawer();
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer, closeDrawer]);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/tours/admin; max-age=31536000; samesite=lax`;
  }

  return (
    <div className="flex min-h-screen bg-muted text-daet-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-blue-600 focus:px-5 focus:py-3 focus:text-sm focus:font-bold focus:text-white"
      >
        Skip to main content
      </a>

      <aside
        aria-label="Admin"
        className={cn(
          "sticky top-0 hidden h-screen flex-none flex-col gap-4 overflow-y-auto overflow-x-hidden [scrollbar-width:thin] [scrollbar-color:var(--color-line)_transparent] border-r border-line bg-muted px-4 pb-6 transition-[width] duration-200 ease-in-out lg:flex",
          collapsed ? "w-[76px]" : "w-60",
        )}
      >
        <div
          className={cn(
            "sticky top-0 z-10 -mx-4 flex items-center gap-2 bg-muted px-4 pb-3 pt-4 after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-6 after:bg-gradient-to-b after:from-muted after:to-transparent",
            collapsed ? "justify-center px-0" : "justify-end",
          )}
        >
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            className="grid h-11 w-11 flex-none place-items-center rounded-xl border border-line bg-surface text-daet-ink hover:border-daet-ink/40"
          >
            <LineIcon name="sidebar" className="h-5 w-5" />
          </button>
        </div>
        <nav aria-label="Admin areas">
          <NavLinks pathname={pathname} counts={counts} collapsed={collapsed} />
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-surface">
        <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur">
          <div className="mx-auto flex min-h-[72px] w-full max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 sm:flex-nowrap sm:px-8 sm:py-0">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <button
                ref={menuButton}
                type="button"
                onClick={() => {
                  clearTimeout(closeTimer.current);
                  setClosing(false);
                  setDrawer(true);
                }}
                aria-expanded={drawer}
                aria-controls="admin-drawer"
                className="grid h-11 w-11 place-items-center rounded-xl text-daet-ink hover:bg-muted lg:hidden"
              >
                <LineIcon name="menu" />
                <span className="sr-only">Open menu</span>
              </button>
              <Wordmark />
            </div>
            <AdminSearch />
            <div className="flex items-center gap-1">
              {/* The public site, as visitors see it. Opens in a new tab so the admin page stays put. */}
              <Link
                href="/"
                target="_blank"
                rel="noopener"
                title="View public site"
                className="hidden h-11 w-11 place-items-center rounded-full text-daet-ink hover:bg-muted sm:grid"
              >
                <LineIcon name="globe" className="h-6 w-6" />
                <span className="sr-only">View public site (opens in a new tab)</span>
              </Link>
              <Link
                href="/tours/admin/messages"
                title="Messages"
                className="relative hidden h-11 w-11 place-items-center rounded-full text-daet-ink hover:bg-muted sm:grid"
              >
                <LineIcon name="message" className="h-6 w-6" />
                <span className="sr-only">Messages</span>
                <UnreadMessagesBadge className="absolute right-0 top-0" />
              </Link>
              <NotificationBell initial={notifications} />
            </div>
            <AccountMenu
              initial={account.initial}
              name={account.name}
              avatarUrl={account.avatarUrl}
              links={accountLinks}
            />
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl px-4 pb-28 pt-6 outline-none sm:px-8 sm:py-8"
        >
          {children}
        </main>
      </div>

      {drawer ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            aria-hidden="true"
            onClick={closeDrawer}
            data-closing={closing ? "" : undefined}
            className="motion-scrim absolute inset-0 bg-slate-900/45"
          />
          <aside
            id="admin-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Admin menu"
            data-closing={closing ? "" : undefined}
            className="motion-drawer absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--color-line)_transparent] bg-muted"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-muted px-4 pb-3 pt-4 after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-6 after:bg-gradient-to-b after:from-muted after:to-transparent">
              <Wordmark />
              <button
                type="button"
                autoFocus
                onClick={() => {
                  closeDrawer();
                  menuButton.current?.focus();
                }}
                className="grid h-11 w-11 place-items-center rounded-xl text-daet-ink hover:bg-surface"
              >
                <LineIcon name="close" />
                <span className="sr-only">Close menu</span>
              </button>
            </div>
            <nav aria-label="Admin areas" className="px-4 pb-6">
              <NavLinks
                pathname={pathname}
                counts={counts}
                onNavigate={closeDrawer}
              />
            </nav>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
