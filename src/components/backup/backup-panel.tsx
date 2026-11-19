import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { BACKUP_FORMATS, type BackupItemDef } from "@/lib/tours/backup";

/**
 * Save your data: tick what to include and pick a format. A plain GET form to the role's download
 * route, so the browser saves the file and nothing here needs JavaScript. Long lists show under
 * the headings their items name.
 */
export function BackupPanel({ action, items, intro }: { action: string; items: readonly BackupItemDef[]; intro: ReactNode }) {
  const groups = [...new Set(items.map((i) => i.group ?? ""))];
  return (
    <section aria-labelledby="backup-heading" className="max-w-4xl rounded-2xl card-edge bg-surface p-6">
      {/* The page's own h1 says "Data backup"; this names the form's region for screen readers and tests. */}
      <h2 id="backup-heading" className="sr-only">
        Choose what to save
      </h2>
      <p className="text-sm text-daet-ink/70">{intro}</p>
      <form action={action} method="get" className="mt-4 space-y-4">
        {groups.map((group) => (
          <fieldset key={group || "all"}>
            <legend className="text-sm font-bold text-daet-ink">{group || "What to save"}</legend>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {items
                .filter((i) => (i.group ?? "") === group)
                .map((item) => (
                  <li key={item.id} className="min-w-0">
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-line px-3 py-2 hover:bg-muted">
                      <Checkbox name="items" value={item.id} defaultChecked={item.defaultOn !== false} className="h-6! w-6!" />
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
        <Field id="backup-format" label="Format" className="max-w-md">
          <Select name="format" defaultValue="zip">
            {BACKUP_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit">Download backup</Button>
      </form>
    </section>
  );
}
