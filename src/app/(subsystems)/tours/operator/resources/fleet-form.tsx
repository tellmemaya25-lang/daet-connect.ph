"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import {
  MAX_SEATS,
  MAX_UNITS,
  RESOURCE_KINDS,
  RESOURCE_KIND_LABELS,
  parseResourceDraft,
  type Resource,
  type ResourceKind,
} from "@/lib/tours/operator-resources";
import { deleteResource, saveResource, setResourceActive } from "./actions";

/**
 * The fleet list: what the operator owns, one row each (20261223).
 * A package that declares no needs keeps the old per-date seat capacity, so an
 * empty list is a valid state, not an error.
 */
export function FleetForm({ resources }: { resources: Resource[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(resources.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ success: boolean; error?: string }>, done?: () => void) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      done?.();
    });
  };

  return (
    <div className="space-y-6">
      {error && (
        <Notice variant="error" title="That did not save">
          {error}
        </Notice>
      )}

      {resources.length === 0 ? (
        <Notice variant="info" title="No boats or vans listed yet">
          Add what you own — a boat, a van, a driver — and then say which tours need it. Until you do,
          each tour simply sells the seats you opened for its date.
        </Notice>
      ) : (
        <ul className="space-y-3">
          {resources.map((resource) =>
            editing === resource.id ? (
              <li key={resource.id}>
                <ResourceForm
                  resource={resource}
                  pending={pending}
                  onCancel={() => setEditing(null)}
                  onSave={(draft) =>
                    run(() => saveResource({ id: resource.id, ...draft }), () => setEditing(null))
                  }
                />
              </li>
            ) : (
              <li
                key={resource.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl card-edge bg-surface p-4"
              >
                <div className="min-w-0">
                  <p className="font-bold text-daet-ink">
                    {resource.name}
                    {!resource.is_active && (
                      <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-daet-ink/70">
                        off
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-daet-ink/70">
                    {RESOURCE_KIND_LABELS[resource.kind]} ·{" "}
                    {resource.seats === 0 ? "no seats" : `${resource.seats} seat${resource.seats === 1 ? "" : "s"} each`} ·{" "}
                    {resource.units === 1 ? "1 in your fleet" : `${resource.units} in your fleet`}
                    {resource.note ? ` · ${resource.note}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => setEditing(resource.id)} disabled={pending}>
                    Edit
                  </Button>
                  <Button
                   
                    variant="secondary"
                    disabled={pending}
                    onClick={() => run(() => setResourceActive(resource.id, !resource.is_active))}
                  >
                    {resource.is_active ? "Turn off" : "Turn on"}
                  </Button>
                  <Button variant="secondary" disabled={pending} onClick={() => run(() => deleteResource(resource.id))}>
                    Remove
                  </Button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      {showNew ? (
        <ResourceForm
          pending={pending}
          onCancel={() => setShowNew(false)}
          onSave={(draft) => run(() => saveResource(draft), () => setShowNew(false))}
        />
      ) : (
        <Button variant="secondary" onClick={() => setShowNew(true)} disabled={pending}>
          + Add a boat, van or driver
        </Button>
      )}
    </div>
  );
}

function ResourceForm({
  resource,
  pending,
  onSave,
  onCancel,
}: {
  resource?: Resource;
  pending: boolean;
  onSave: (draft: { kind: string; name: string; seats: number; units: number; note: string | null }) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<ResourceKind>(resource?.kind ?? "boat");
  const [name, setName] = useState(resource?.name ?? "");
  const [seats, setSeats] = useState(String(resource?.seats ?? 12));
  const [units, setUnits] = useState(String(resource?.units ?? 1));
  const [note, setNote] = useState(resource?.note ?? "");
  const [localError, setLocalError] = useState<string | null>(null);
  const idPrefix = resource?.id ?? "new-resource";

  // "units" is how many are in the fleet; "seats" is what one carries.
  const countValue = (value: string) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  return (
    <form
      className="rounded-2xl card-edge bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = parseResourceDraft({ kind, name, seats: countValue(seats), units: countValue(units), note });
        if (!parsed.ok) {
          setLocalError(parsed.error);
          return;
        }
        setLocalError(null);
        onSave({ kind: parsed.value.kind, name: parsed.value.name, seats: parsed.value.seats, units: parsed.value.units, note: parsed.value.note });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${idPrefix}-kind`} label="What is it">
          <Select value={kind} onChange={(event) => setKind(event.target.value as ResourceKind)}>
            {RESOURCE_KINDS.map((value) => (
              <option key={value} value={value}>
                {RESOURCE_KIND_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field id={`${idPrefix}-name`} label="Name" hint="Something you will recognise on the day, like “Boat 1”." required>
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required />
        </Field>

        <Field
          id={`${idPrefix}-seats`}
          label="Guests it carries"
          hint="Per unit. Put 0 for a driver, who carries nobody directly."
          required
        >
          <Input
            type="number"
            min={0}
            max={MAX_SEATS}
            step={1}
            value={seats}
            onChange={(event) => setSeats(event.target.value)}
            required
          />
        </Field>

        <Field id={`${idPrefix}-units`} label="How many you have" hint="2 boats = 2, so two tours can go out at once." required>
          <Input
            type="number"
            min={1}
            max={MAX_UNITS}
            step={1}
            value={units}
            onChange={(event) => setUnits(event.target.value)}
            required
          />
        </Field>
      </div>

      <Field id={`${idPrefix}-note`} label="Note (optional)" className="mt-4">
        <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Plate number, colour, skipper" />
      </Field>

      {localError && (
        <p role="alert" className="mt-3 text-sm font-bold text-red-700 dark:text-red-300">
          {localError}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" loading={pending}>
          {resource ? "Save changes" : "Add to my fleet"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
