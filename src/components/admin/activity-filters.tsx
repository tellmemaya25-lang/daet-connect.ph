"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * The activity filters. On a phone they sit behind a button (with a count of
 * the filters in use) so the table is not pushed below the fold; from `lg`
 * the form is always shown. The form itself stays a plain GET form.
 */
export function ActivityFilters({ active, children }: { active: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <div className="mb-4 rounded-2xl card-edge bg-surface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center justify-between px-4 text-left text-sm font-bold text-daet-ink lg:hidden"
      >
        <span>{active ? `Filters (${active} in use)` : "Filters"}</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      <div id={panel} className={open ? "block" : "hidden lg:block"}>
        {children}
      </div>
    </div>
  );
}
