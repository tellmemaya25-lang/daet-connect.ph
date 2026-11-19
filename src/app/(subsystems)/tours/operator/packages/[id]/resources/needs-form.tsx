"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import {
  MAX_SEATS_PER_PAX,
  MAX_UNITS_PER_BOOKING,
  RESOURCE_KIND_LABELS,
  RESOURCE_KIND_PLURALS,
  type Resource,
  type ResourceKind,
  type ResourceNeed,
} from "@/lib/tours/operator-resources";
import { savePackageNeeds } from "../../../resources/actions";

/**
 * One row per kind the operator owns: does this tour use it, how many seats per
 * guest, and how many of it per booking (a van is one per booking whatever the
 * group size).
 */
export function NeedsForm({
  packageId,
  owned,
  needs,
}: {
  packageId: string;
  owned: Resource[];
  needs: ResourceNeed[];
}) {
  const byKind = new Map(needs.map((need) => [need.kind, need]));
  const [rows, setRows] = useState(
    owned.map((resource) => {
      const existing = byKind.get(resource.kind);
      return {
        kind: resource.kind,
        used: Boolean(existing),
        seatsPerPax: String(existing?.seats_per_pax ?? 1),
        unitsPerBooking: String(existing?.units_per_booking ?? 0),
      };
    }),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const update = (kind: ResourceKind, patch: Partial<(typeof rows)[number]>) =>
    setRows((current) => current.map((row) => (row.kind === kind ? { ...row, ...patch } : row)));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const chosen = rows
      .filter((row) => row.used)
      .map((row) => ({
        kind: row.kind,
        seatsPerPax: Number(row.seatsPerPax) || 0,
        unitsPerBooking: Number(row.unitsPerBooking) || 0,
      }));
    startTransition(async () => {
      const result = await savePackageNeeds(packageId, chosen);
      if (!result.success) {
        setError(result.error ?? "Could not save this tour's needs.");
        return;
      }
      setSaved(true);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      {error && (
        <Notice variant="error" title="That did not save">
          {error}
        </Notice>
      )}
      {saved && (
        <Notice variant="success" title="Saved">
          New bookings will check your fleet from now on. Bookings already made keep the boat they were given.
        </Notice>
      )}

      {rows.map((row) => (
        <section key={row.kind} className="rounded-2xl card-edge bg-surface p-6">
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <Checkbox checked={row.used} onChange={(event) => update(row.kind, { used: event.target.checked })} />
            <span className="font-bold text-daet-ink">This tour uses your {RESOURCE_KIND_PLURALS[row.kind].toLowerCase()}</span>
          </label>

          {row.used && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field
                id={`${row.kind}-seats`}
                label="Seats per guest"
                hint={`1 means each guest takes one seat on the ${RESOURCE_KIND_LABELS[row.kind].toLowerCase()}.`}
              >
                <Input
                  type="number"
                  min={0}
                  max={MAX_SEATS_PER_PAX}
                  step={1}
                  value={row.seatsPerPax}
                  onChange={(event) => update(row.kind, { seatsPerPax: event.target.value })}
                />
              </Field>
              <Field
                id={`${row.kind}-units`}
                label="How many per booking"
                hint="A van that goes out once, whatever the group size, is 1."
              >
                <Input
                  type="number"
                  min={0}
                  max={MAX_UNITS_PER_BOOKING}
                  step={1}
                  value={row.unitsPerBooking}
                  onChange={(event) => update(row.kind, { unitsPerBooking: event.target.value })}
                />
              </Field>
            </div>
          )}
        </section>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending}>
          Save what this tour needs
        </Button>
        <p className="self-center text-sm text-daet-ink/60">
          Leave everything unticked to keep selling seats per date, as before.
        </p>
      </div>
    </form>
  );
}
