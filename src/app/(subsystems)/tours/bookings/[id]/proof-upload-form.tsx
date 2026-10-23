"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PROOF_METHODS } from "@/lib/tours/payment-proof";
import { submitPaymentProof, type ProofActionState } from "./payment-actions";

const INITIAL: ProofActionState = { message: null, errors: {} };

export function ProofUploadForm({ bookingId, remaining }: { bookingId: string; remaining: number }) {
  const [state, setState] = useState<ProofActionState>(INITIAL);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const next = await submitPaymentProof(state, formData);
      setState(next);
      if (next.submitted) form.reset();
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
        <input
          id="proof"
          name="proof"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          aria-invalid={errors.proof ? true : undefined}
          className="mt-2 block w-full text-sm text-daet-ink file:mr-3 file:min-h-11 file:rounded-full file:border-0 file:bg-daet-forest file:px-4 file:text-sm file:font-bold file:text-white"
        />
      </Field>

      <Button type="submit" variant="secondary" fullWidth loading={pending} loadingText="Uploading…">
        Send receipt to operator
      </Button>
    </form>
  );
}
