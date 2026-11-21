"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { BACKUP_FORMATS, type BackupItemDef } from "@/lib/tours/backup";

/**
 * Save your data: tick what to include and pick a format. A plain GET form to the role's download
 * route, so the browser saves the file; the count and select all/none are a convenience on top.
 * Long lists show under the headings their items name.
 */
export function BackupPanel({
  action,
  items,
  intro,
  privacyNote,
}: {
  action: string;
  items: readonly BackupItemDef[];
  intro: ReactNode;
  /** Shown beside the Download button, where the choice is made. */
  privacyNote?: ReactNode;
}) {
  const groups = [...new Set(items.map((i) => i.group ?? ""))];
  const [selected, setSelected] = useState<Set<string>>(() => new Set(items.filter((i) => i.defaultOn !== false).map((i) => i.id)));
  const [format, setFormat] = useState<string>(BACKUP_FORMATS[0].id);
  const count = selected.size;
  const groupCount = groups.filter((g) => items.some((i) => (i.group ?? "") === g && selected.has(i.id))).length;
  const formatHint = BACKUP_FORMATS.find((f) => f.id === format)?.hint;

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function onSubmit(e: FormEvent) {
    if (count === 0) e.preventDefault();
  }

  return (
    <section aria-labelledby="backup-heading" className="rounded-2xl card-edge bg-surface p-6">
      {/* The page's own h1 says "Data backup"; this names the form's region for screen readers and tests. */}
      <h2 id="backup-heading" className="sr-only">
        Choose what to save
      </h2>
      <p className="max-w-3xl text-sm text-daet-ink/70">{intro}</p>
      <form action={action} method="get" onSubmit={onSubmit} className="mt-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => setSelected(new Set(items.map((i) => i.id)))}>
            Select all
          </Button>
          <Button type="button" variant="secondary" onClick={() => setSelected(new Set())}>
            Select none
          </Button>
        </div>
        {groups.map((group) => (
          <fieldset key={group || "all"}>
            <legend className="text-sm font-bold text-daet-ink">{group || "What to save"}</legend>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {items
                .filter((i) => (i.group ?? "") === group)
                .map((item) => (
                  <li key={item.id} className="min-w-0">
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-line px-3 py-2 hover:bg-muted">
                      <Checkbox
                        name="items"
                        value={item.id}
                        checked={selected.has(item.id)}
                        onChange={(e) => toggle(item.id, e.target.checked)}
                        className="h-6! w-6!"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-daet-ink">{item.label}</span>
                        <span className="block text-xs text-daet-ink/70">{item.hint}</span>
                      </span>
                    </label>
                  </li>
                ))}
            </ul>
          </fieldset>
        ))}
        <Field id="backup-format" label="Format" hint={formatHint} className="max-w-md">
          <Select name="format" value={format} onChange={(e) => setFormat(e.target.value)}>
            {BACKUP_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
        <p role="status" aria-live="polite" data-testid="backup-summary" className="text-sm font-bold text-daet-ink">
          {count === 0
            ? "Nothing selected. Tick at least one item to download."
            : `${count} of ${items.length} item${items.length === 1 ? "" : "s"} selected${groups.length > 1 ? ` in ${groupCount} of ${groups.length} groups` : ""}.`}
        </p>
        <div className="space-y-2">
          <Button type="submit" disabled={count === 0}>
            Download backup
          </Button>
          <p className="max-w-3xl text-sm text-daet-ink/70">
            {privacyNote ?? "The file may include personal contact details. Keep it private and store it somewhere safe."}
          </p>
        </div>
      </form>
    </section>
  );
}
