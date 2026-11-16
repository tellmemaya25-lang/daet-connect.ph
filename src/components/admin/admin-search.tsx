"use client";

import { useEffect, useRef } from "react";
import { LineIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/field";

/**
 * The top bar's search. It submits to the dashboard's record search (/tours/admin?q=…),
 * which shows the grouped results. Ctrl+Space focuses it from anywhere in the admin.
 */
export function AdminSearch() {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === "Space") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form
      action="/tours/admin"
      method="get"
      role="search"
      className="relative order-last min-w-0 basis-full sm:order-none sm:max-w-md sm:flex-1 sm:basis-auto"
    >
      <label htmlFor="admin-top-search" className="sr-only">
        Search records
      </label>
      <LineIcon
        name="search"
        className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-daet-ink/70"
      />
      <Input
        ref={input}
        id="admin-top-search"
        type="search"
        name="q"
        minLength={2}
        maxLength={80}
        required
        placeholder="Search records"
        aria-keyshortcuts="Control+Space"
        className="min-h-11 rounded-full bg-muted pl-10 pr-4 text-sm lg:pr-28"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-xl border border-line bg-surface px-2 text-xs font-bold leading-5 text-daet-ink/70 lg:block"
      >
        Ctrl Space
      </span>
    </form>
  );
}
