"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LineIcon } from "@/components/ui/icons";
import { LogoutButton } from "@/components/ui/logout-button";
import { cn } from "@/components/ui/cn";
import { ADMIN_AREAS, SIDEBAR_COOKIE, areaFor } from "./nav";

function NavLinks({ pathname, collapsed = false, onNavigate }: { pathname: string; collapsed?: boolean; onNavigate?: () => void }) {
  const current = areaFor(pathname);
  return (
    <ul className="flex flex-col gap-1">
      {ADMIN_AREAS.map((a) => {
        const on = current?.href === a.href;
        return (
          <li key={a.href}>
            <Link
              href={a.href}
              onClick={onNavigate}
              aria-current={on ? "page" : undefined}
              title={collapsed ? a.label : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold",
                on ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-surface hover:text-blue-700",
                collapsed && "justify-center px-0",
              )}
            >
              <LineIcon name={a.icon} className="h-5 w-5 flex-none" />
              {collapsed ? <span className="sr-only">{a.label}</span> : <span className="truncate">{a.label}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Wordmark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link href="/tours/admin" className="flex min-h-11 items-center gap-2 font-serif text-lg font-semibold text-slate-900">
      <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-sm text-white">D</span>
      {collapsed ? <span className="sr-only">Daet Connect admin</span> : <span>Daet Connect</span>}
    </Link>
  );
}

/**
 * The admin shell: sidebar, top bar and, on phones, a header with a menu drawer.
 * The sidebar collapses only from its button (remembered in a cookie); the top bar never hides on scroll.
 */
export function AdminShell({ children, initialCollapsed, name }: { children: ReactNode; initialCollapsed: boolean; name: string }) {
  const pathname = usePathname() ?? "/tours/admin";
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [drawer, setDrawer] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const section = areaFor(pathname)?.label ?? "Admin";

  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawer(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/tours/admin; max-age=31536000; samesite=lax`;
  }

  return (
    <div className="flex min-h-screen bg-muted text-slate-900">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-blue-600 focus:px-5 focus:py-3 focus:text-sm focus:font-bold focus:text-white"
      >
        Skip to main content
      </a>

      <aside
        aria-label="Admin"
        className={cn(
          "sticky top-0 hidden h-screen flex-none flex-col gap-4 overflow-y-auto border-r border-slate-300 bg-muted p-4 lg:flex",
          collapsed ? "w-20" : "w-60",
        )}
      >
        <div className={cn("flex items-center gap-2", collapsed ? "flex-col" : "justify-between")}>
          <Wordmark collapsed={collapsed} />
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            className="grid h-11 w-11 place-items-center rounded-xl text-slate-600 hover:bg-surface hover:text-blue-700"
          >
            <LineIcon name="menu" />
          </button>
        </div>
        <nav aria-label="Admin areas">
          <NavLinks pathname={pathname} collapsed={collapsed} />
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-surface">
        <header className="sticky top-0 z-20 flex min-h-[72px] items-center justify-between gap-4 border-b border-slate-400 bg-surface px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <button
              ref={menuButton}
              type="button"
              onClick={() => setDrawer(true)}
              aria-expanded={drawer}
              aria-controls="admin-drawer"
              className="grid h-11 w-11 place-items-center rounded-xl text-slate-700 hover:bg-muted lg:hidden"
            >
              <LineIcon name="menu" />
              <span className="sr-only">Open menu</span>
            </button>
            <p className="truncate font-serif text-xl font-semibold">{section}</p>
          </div>
          <details className="relative">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full px-3 text-sm font-bold hover:bg-muted [&::-webkit-details-marker]:hidden">
              <LineIcon name="user" />
              <span className="hidden max-w-40 truncate sm:inline">{name}</span>
              <span className="sr-only sm:hidden">Account</span>
            </summary>
            <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-slate-300 bg-surface p-2 shadow-[var(--shadow-float)]">
              <p className="px-3 py-2 text-sm text-slate-600">Signed in as {name}</p>
              <Link href="/" className="flex min-h-11 items-center rounded-xl px-3 text-sm font-bold hover:bg-muted">
                View the public site
              </Link>
              <LogoutButton className="w-full" />
            </div>
          </details>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 py-6 outline-none sm:px-8 sm:py-8">
          {children}
        </main>
      </div>

      {drawer ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div aria-hidden="true" onClick={() => setDrawer(false)} className="absolute inset-0 bg-slate-900/45" />
          <aside
            id="admin-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Admin menu"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-muted"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-muted px-4 pb-3 pt-4 after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-6 after:bg-gradient-to-b after:from-muted after:to-transparent">
              <Wordmark />
              <button
                type="button"
                autoFocus
                onClick={() => {
                  setDrawer(false);
                  menuButton.current?.focus();
                }}
                className="grid h-11 w-11 place-items-center rounded-xl text-slate-700 hover:bg-surface"
              >
                <LineIcon name="close" />
                <span className="sr-only">Close menu</span>
              </button>
            </div>
            <nav aria-label="Admin areas" className="px-4 pb-6">
              <NavLinks pathname={pathname} onNavigate={() => setDrawer(false)} />
            </nav>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
