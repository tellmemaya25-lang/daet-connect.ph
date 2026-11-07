"use client";

/**
 * Step 1 of the create wizard: the words that describe the tour.
 *
 * Everything goes through the shared field kit (`Field`, `Input`, `Select`,
 * `Textarea`), so labels, hints, counters and errors are wired to their control
 * for screen readers. Errors appear on blur and again on "Continue", never on
 * every keystroke.
 */

import { useState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { EDIT_LIMITS } from "../[id]/edit/edit-constants";
import type { EditPackageFormData, ValidationErrors } from "../[id]/edit/edit-types";
import { formatDuration } from "../components/package-draft";

interface BasicDetailsStepProps {
  data: EditPackageFormData;
  errors: ValidationErrors;
  /** True after a failed "Continue": show every error, not only the touched ones. */
  showAllErrors?: boolean;
  onUpdate: (patch: Partial<EditPackageFormData>) => void;
}

type FieldName = "title" | "locationName" | "description" | "durationValue";

export function BasicDetailsStep({ data, errors, showAllErrors = false, onUpdate }: BasicDetailsStepProps) {
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});

  const errorFor = (field: FieldName) => (showAllErrors || touched[field] ? errors[field] : undefined);
  const markTouched = (field: FieldName) => setTouched((current) => ({ ...current, [field]: true }));

  const durationPreview = data.durationValue > 0 ? formatDuration(data.durationValue, data.durationType) : null;

  return (
    <div className="space-y-6">
      <Field
        id="title"
        label="Package title"
        required
        hint={`Tourists see this first. ${data.title.trim().length}/${EDIT_LIMITS.title.max} characters.`}
        error={errorFor("title")}
      >
        <Input
          name="title"
          value={data.title}
          maxLength={EDIT_LIMITS.title.max}
          autoComplete="off"
          placeholder="e.g. Bagasbas surf lesson for beginners"
          onChange={(event) => onUpdate({ title: event.target.value })}
          onBlur={() => markTouched("title")}
        />
      </Field>

      <Field
        id="location"
        label="Where the tour starts"
        required
        hint="A place tourists can find, for example Bagasbas Beach, Daet."
        error={errorFor("locationName")}
      >
        <Input
          name="location"
          value={data.locationName}
          maxLength={EDIT_LIMITS.locationName.max}
          autoComplete="off"
          placeholder="e.g. Bagasbas Beach, Daet"
          onChange={(event) => onUpdate({ locationName: event.target.value })}
          onBlur={() => markTouched("locationName")}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="duration-value"
          label="How long the tour takes"
          required
          hint={durationPreview ? `Reads as: ${durationPreview}` : "Use a half day, a full day, or hours."}
          error={errorFor("durationValue")}
        >
          <Input
            name="duration_value"
            type="number"
            inputMode="decimal"
            min={EDIT_LIMITS.duration.min}
            max={EDIT_LIMITS.duration.max}
            step={0.5}
            value={Number.isFinite(data.durationValue) ? String(data.durationValue) : ""}
            onChange={(event) => {
              const next = Number(event.target.value);
              onUpdate({ durationValue: Number.isFinite(next) ? next : 0 });
            }}
            onBlur={() => markTouched("durationValue")}
          />
        </Field>

        <Field id="duration-type" label="Hours or days" required>
          <Select
            name="duration_type"
            value={data.durationType}
            onChange={(event) => onUpdate({ durationType: event.target.value === "hours" ? "hours" : "days" })}
          >
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </Select>
        </Field>
      </div>

      <Field
        id="description"
        label="What the tour is like"
        hint={`Optional. ${(data.description ?? "").length}/${EDIT_LIMITS.description.max} characters — a few sentences help tourists choose.`}
        error={errorFor("description")}
      >
        <Textarea
          name="description"
          value={data.description ?? ""}
          maxLength={EDIT_LIMITS.description.max}
          // Grows with the words instead of trapping them in a small box.
          rows={Math.min(12, Math.max(5, Math.ceil((data.description ?? "").length / 70) + 4))}
          placeholder="Morning boat ride to Apuao Grande, snorkelling, then lunch on the sand."
          onChange={(event) => onUpdate({ description: event.target.value || null })}
          onBlur={() => markTouched("description")}
        />
      </Field>
    </div>
  );
}
