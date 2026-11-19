import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { BACKUP_FORMATS, BACKUP_ITEMS } from "@/lib/tours/backup";

/**
 * Save your own data: tick what to include and pick a format. A plain GET form to the backup
 * route, so the browser downloads the file and nothing here needs JavaScript.
 */
export function BackupSection() {
  return (
    <section aria-labelledby="backup-heading" className="mt-6 rounded-2xl card-edge bg-surface p-6">
      <h2 id="backup-heading" className="text-xl font-bold text-daet-ink">
        Data backup
      </h2>
      <p className="mt-1 text-sm text-daet-ink/70">
        Download a copy of your own records to keep. Choose what to save. Bank and GCash numbers are never included. Bookings include the guest contact details you already see there, so keep the file private.
      </p>
      <form action="/tours/operator/backup" method="get" className="mt-4 space-y-4">
        <fieldset>
          <legend className="text-sm font-bold text-daet-ink">What to save</legend>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {BACKUP_ITEMS.map((item) => (
              <li key={item.id}>
                <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-line px-3 py-2 hover:bg-muted">
                  <Checkbox name="items" value={item.id} defaultChecked className="mt-1" />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-daet-ink">{item.label}</span>
                    <span className="block text-xs text-daet-ink/70">{item.hint}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
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
