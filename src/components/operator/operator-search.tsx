"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/field";
import { LineIcon } from "@/components/ui/icons";

/**
 * The operator top bar's search: an icon that grows into a box and submits to the bookings
 * board (/tours/operator/bookings?q=…), which does the matching. Ctrl+Space opens it from
 * anywhere. Escape, or clicking away from an empty box, folds it back to the icon.
 */
export function OperatorSearch() {
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);

  useEffect(() => {
    openRef.current = open;
    if (open) input.current?.focus();
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === "Space") {
        e.preventDefault();
        if (openRef.current) input.current?.focus();
        else setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function fold(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  }

  return (
    <form
      action="/tours/operator/bookings"
      method="get"
      role="search"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) fold(true);
      }}
      onBlur={(e) => {
        if (
          open &&
          !e.currentTarget.contains(e.relatedTarget) &&
          !input.current?.value
        )
          fold(false);
      }}
      className={cn(
        "relative h-11 min-w-0 flex-none transition-[width] duration-200 ease-out",
        open ? "order-last w-full sm:order-none sm:w-72 xl:w-80" : "w-11",
      )}
    >
      <label htmlFor="operator-top-search" className="sr-only">
        Find a booking
      </label>
      <Input
        ref={input}
        id="operator-top-search"
        type="search"
        name="q"
        minLength={2}
        maxLength={200}
        required
        inert={!open}
        aria-keyshortcuts="Control+Space"
        placeholder="Reference, package, name or phone"
        className={cn(
          "absolute inset-0 !mt-0 h-11 !min-h-0 rounded-full bg-muted pl-11 pr-4 !text-sm transition-opacity lg:pr-28 duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-keyshortcuts="Control+Space"
        onClick={() => (open ? input.current?.focus() : setOpen(true))}
        className={cn(
          "absolute left-0 top-0 grid h-11 w-11 place-items-center rounded-full text-daet-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-daet-forest/40",
          open ? "pointer-events-none" : "hover:bg-muted",
        )}
      >
        <LineIcon name="search" className="h-6 w-6" />
        <span className="sr-only">{open ? "Find a booking" : "Open booking search"}</span>
      </button>
      <button type="submit" tabIndex={-1} className="sr-only" aria-hidden="true">
        Go
      </button>
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-xl border border-line bg-surface px-2 text-xs font-bold leading-5 text-daet-ink/70 transition-opacity duration-200",
          open ? "lg:block" : "opacity-0",
        )}
      >
        Ctrl Space
      </span>
    </form>
  );
}
