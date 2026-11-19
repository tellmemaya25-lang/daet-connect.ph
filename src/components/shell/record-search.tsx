"use client";

import { useEffect, useRef, useState } from "react";
import { LineIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/field";
import { cn } from "@/components/ui/cn";

export type SearchOption = { readonly value: string; readonly label: string };

/** The first option ("all") is the default, and what an unknown URL value falls back to. */
const parse = (options: readonly SearchOption[], raw: string | null) =>
  options.some((o) => o.value === raw) ? (raw as string) : options[0].value;

/**
 * The top bar's search, shared by the role shells. It rests as an icon beside the bell, and grows
 * into a search box (with a small bounce) when it is clicked or Ctrl+Space is pressed. It submits
 * to the role's record search (`action`?q=…), which shows the grouped results.
 * While it is open, a small panel under the box narrows the search by record type and status.
 * Escape, or clicking away from an empty box, folds it back to the icon.
 */
export function RecordSearch({
  action,
  types,
  statuses,
}: {
  /** Where the form submits: the page that shows the results. */
  action: string;
  types: readonly SearchOption[];
  statuses: readonly SearchOption[];
}) {
  const FILTER_GROUPS = [
    { key: "type", label: "Record type", options: types },
    { key: "status", label: "Status", options: statuses },
  ] as const;
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const [type, setType] = useState<string>(types[0].value);
  const [status, setStatus] = useState<string>(statuses[0].value);
  const [group, setGroup] = useState<"type" | "status">("type");
  const [filterText, setFilterText] = useState("");

  useEffect(() => {
    openRef.current = open;
    if (open) input.current?.focus();
  }, [open]);

  function show() {
    // Start from the filters of the search the page is already showing.
    const params = new URLSearchParams(window.location.search);
    setType(parse(types, params.get("type")));
    setStatus(parse(statuses, params.get("status")));
    setFilterText("");
    setOpen(true);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === "Space") {
        e.preventDefault();
        if (openRef.current) input.current?.focus();
        else show();
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
      action={action}
      method="get"
      role="search"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) fold(true);
      }}
      onBlur={(e) => {
        // Leaving the whole form with nothing typed folds it; a typed query stays put.
        if (
          open &&
          !e.currentTarget.contains(e.relatedTarget) &&
          !input.current?.value
        )
          fold(false);
      }}
      className={cn(
        "relative h-11 min-w-0 flex-none transition-[width] duration-[420ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]",
        open
          ? "search-bounce order-last w-full sm:order-none sm:w-72 xl:w-80"
          : "w-11",
      )}
    >
      <label htmlFor="record-top-search" className="sr-only">
        Search records
      </label>
      <Input
        ref={input}
        id="record-top-search"
        type="search"
        name="q"
        minLength={2}
        maxLength={80}
        required
        inert={!open}
        placeholder="Search records"
        aria-keyshortcuts="Control+Space"
        className={cn(
          "absolute inset-0 !mt-0 h-11 !min-h-0 rounded-full bg-muted pl-11 pr-4 !text-sm transition-opacity duration-200 lg:pr-28",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-keyshortcuts="Control+Space"
        onClick={() => (open ? input.current?.focus() : show())}
        className={cn(
          "absolute left-0 top-0 grid h-11 w-11 place-items-center rounded-full text-daet-ink transition-[background-color,scale] duration-150 ease-out active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-daet-forest/40",
          open ? "pointer-events-none" : "hover:bg-muted",
        )}
      >
        <LineIcon name="search" className="h-6 w-6" />
        <span className="sr-only">
          {open ? "Search records" : "Open search"}
        </span>
      </button>
      {/* Two text fields would otherwise stop Enter from submitting. */}
      <button
        type="submit"
        tabIndex={-1}
        className="sr-only"
        aria-hidden="true"
      >
        Search
      </button>
      <div
        inert={!open}
        className={cn(
          "absolute left-0 top-full z-30 mt-2 w-full overflow-hidden rounded-2xl border border-line bg-surface transition-[opacity,translate] duration-200 sm:left-auto sm:right-0 sm:w-[30rem]",
          open
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1 opacity-0",
        )}
      >
        <Input type="hidden" name="type" value={type} readOnly />
        <Input type="hidden" name="status" value={status} readOnly />
        <div className="grid sm:grid-cols-[11rem_1fr]">
          <div className="border-b border-line p-2 sm:border-b-0 sm:border-r">
            <label htmlFor="record-top-search-filters" className="sr-only">
              Search through all filters
            </label>
            <Input
              id="record-top-search-filters"
              type="search"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              placeholder="Search filters"
              className="!mt-0 h-10 !min-h-0 rounded-xl bg-muted !text-sm"
            />
            <ul className="mt-2 flex gap-1 sm:block sm:space-y-1">
              {FILTER_GROUPS.map((g) => {
                const current = g.options.find(
                  (o) => o.value === (g.key === "type" ? type : status),
                );
                const active = group === g.key && !filterText;
                return (
                  <li key={g.key} className="min-w-0 flex-1">
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setGroup(g.key);
                        setFilterText("");
                      }}
                      className={cn(
                        "flex w-full flex-col rounded-xl px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-daet-forest/40",
                        active
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                          : "hover:bg-muted",
                      )}
                    >
                      <span className="text-sm font-bold">{g.label}</span>
                      <span className="truncate text-xs text-daet-ink/70">
                        {current?.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {FILTER_GROUPS.filter((g) => filterText || g.key === group).map(
              (g) => {
                const options = g.options.filter((o) =>
                  o.label
                    .toLowerCase()
                    .includes(filterText.trim().toLowerCase()),
                );
                if (options.length === 0) return null;
                return (
                  <div
                    key={g.key}
                    role="radiogroup"
                    aria-label={g.label}
                    className="mb-2 last:mb-0"
                  >
                    <p className="px-3 py-1 text-sm font-bold text-daet-ink">
                      {g.label}
                    </p>
                    {options.map((o) => {
                      const selected =
                        o.value === (g.key === "type" ? type : status);
                      return (
                        <button
                          key={o.value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() =>
                            g.key === "type"
                              ? setType(o.value)
                              : setStatus(o.value)
                          }
                          className={cn(
                            "flex min-h-10 w-full items-center justify-between rounded-xl px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-daet-forest/40",
                            selected
                              ? "bg-blue-50 font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                              : "text-daet-ink hover:bg-muted",
                          )}
                        >
                          {o.label}
                          {selected ? (
                            <LineIcon name="check" className="h-4 w-4" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                );
              },
            )}
          </div>
        </div>
        <p className="border-t border-line px-4 py-2 text-xs text-daet-ink/70">
          Type at least 2 characters, then press Enter.
        </p>
      </div>
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
