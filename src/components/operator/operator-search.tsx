"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/field";
import { LineIcon } from "@/components/ui/icons";

/**
 * The operator top bar's search: an icon that grows into a box and submits to the bookings
 * board (/tours/operator/bookings?q=…), which does the matching. Escape, or clicking away
 * from an empty box, folds it back to the icon.
 */
export function OperatorSearch() {
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

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
        maxLength={200}
        required
        inert={!open}
        placeholder="Reference, package, name or phone"
        className={cn(
          "absolute inset-0 !mt-0 h-11 !min-h-0 rounded-full bg-muted pl-11 pr-4 !text-sm transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <button
        ref={button}
        type="button"
        aria-expanded={open}
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
    </form>
  );
}
