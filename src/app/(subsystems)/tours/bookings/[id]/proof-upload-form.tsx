"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { LineIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { PROOF_METHODS } from "@/lib/tours/payment-proof";
import { submitPaymentProof, type ProofActionState } from "./payment-actions";

const INITIAL: ProofActionState = { message: null, errors: {} };

export function ProofUploadForm({ bookingId, remaining }: { bookingId: string; remaining: number }) {
  const [state, setState] = useState<ProofActionState>(INITIAL);
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const next = await submitPaymentProof(state, formData);
      setState(next);
      if (next.submitted) {
        form.reset();
        setFile(null);
      }
    });
  }

  const errors = state.errors;

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="bookingId" value={bookingId} />
      {state.submitted ? (
        <Notice variant="success" title="Receipt sent">
          The operator will check it and update your booking. You can see its status below.
        </Notice>
      ) : null}
      {state.message ? <Notice variant="error">{state.message}</Notice> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="amount" label="Amount paid (₱)" required error={errors.amount}>
          <Input id="amount" name="amount" inputMode="decimal" defaultValue={remaining.toFixed(2)} invalid={Boolean(errors.amount)} />
        </Field>
        <Field id="paymentMethod" label="Paid with" required error={errors.paymentMethod}>
          <Select id="paymentMethod" name="paymentMethod" defaultValue="gcash" invalid={Boolean(errors.paymentMethod)}>
            {Object.entries(PROOF_METHODS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field id="referenceNumber" label="Reference number" hint="From your GCash or bank receipt" required error={errors.referenceNumber}>
        <Input id="referenceNumber" name="referenceNumber" autoComplete="off" invalid={Boolean(errors.referenceNumber)} />
      </Field>

      <Field id="proof" label="Receipt screenshot or PDF" hint="JPG, PNG, WebP or PDF up to 5 MB" required error={errors.proof}>
        <ReceiptPicker file={file} invalid={Boolean(errors.proof)} onChange={setFile} />
      </Field>

      <Button type="submit" variant="secondary" fullWidth loading={pending} loadingText="Uploading…">
        Send receipt to operator
      </Button>
    </form>
  );
}

/** The receipt file input as a drop zone: name and a thumbnail once chosen. */
function ReceiptPicker({
  file,
  invalid,
  onChange,
  "aria-describedby": describedBy,
}: {
  file: File | null;
  invalid: boolean;
  onChange: (file: File | null) => void;
  /** Set by Field, so the hint and any error are read with the input. */
  "aria-describedby"?: string;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <label
      htmlFor="proof"
      className={`mt-2 flex min-h-24 cursor-pointer items-center gap-4 rounded-2xl border-2 border-dashed p-4 transition-colors focus-within:ring-2 focus-within:ring-blue-600/50 hover:bg-blue-50 dark:hover:bg-blue-950/40 ${
        invalid ? "border-red-600" : file ? "border-blue-600/60 bg-blue-50/50 dark:bg-blue-950/30" : "border-daet-ink/25"
      }`}
    >
      <input
        id="proof"
        name="proof"
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        className="sr-only"
        onChange={(event) => onChange(event.currentTarget.files?.[0] ?? null)}
      />
      <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted text-daet-ink/70">
        {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <LineIcon name={file ? "receipt" : "camera"} className="h-7 w-7" />}
      </span>
      <span className="min-w-0">
        <span className="block font-bold text-daet-ink">{file ? file.name : "Add a photo of your receipt"}</span>
        <span className="block text-sm text-daet-ink/70">{file ? `${Math.max(1, Math.round(file.size / 1024))} KB · tap to choose another` : "Tap to choose a screenshot or PDF"}</span>
      </span>
    </label>
  );
}
