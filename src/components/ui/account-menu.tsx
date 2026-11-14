"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { UnreadMessagesBadge } from "@/components/chat/unread-badge";
import { LineIcon } from "@/components/ui/icons";
import { LogoutButton } from "@/components/ui/logout-button";
import { ThemeChoices } from "@/components/ui/theme-toggle";
import type { MenuLink } from "@/components/ui/mobile-menu";

/**
 * Account control from md up: a round avatar that opens a short list (your
 * links, the theme choice, Sign out). Phones keep the Menu sheet and the
 * bottom tab bar, so this is hidden below md.
 */
export function AccountMenu({ links }: { links: MenuLink[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const pathname = usePathname() ?? "";

  useEffect(() => setOpen(false), [pathname]);

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
    <div ref={rootRef} className="relative hidden md:block">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Your account"
        onClick={() => setOpen((value) => !value)}
        className="grid min-h-11 min-w-11 place-items-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        <LineIcon name="user" className="h-5 w-5" />
      </button>
      {open ? (
        <div id={menuId} className="absolute right-0 top-full z-50 mt-3 w-72">
          <span aria-hidden="true" className="absolute -top-1.5 right-3.5 h-4 w-4 rotate-45 rounded-[3px] bg-surface" />
          <div className="relative rounded-2xl bg-surface p-2 shadow-[var(--shadow-float)]">
            <ul>
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="flex min-h-12 items-center justify-between gap-3 rounded-xl px-4 text-base text-daet-ink hover:bg-muted"
                  >
                    {link.label}
                    {link.href === "/tours/messages" ? <UnreadMessagesBadge /> : null}
                  </Link>
                </li>
              ))}
            </ul>
            <ThemeChoices />
            <LogoutButton className="mt-2 w-full justify-between rounded-xl border-0 bg-transparent px-4 text-base font-normal hover:bg-muted" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
