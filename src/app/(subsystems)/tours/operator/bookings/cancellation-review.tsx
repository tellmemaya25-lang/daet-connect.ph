"use client";

import { formatPeso } from "@/lib/money";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { recordRefund, resolveCancellationRequest, type CancellationActionResult } from "./cancellation-actions";

export type CancellationRequest = {
  id: string;
  reason: string;
  requested_at: string;
  status: string;
};

const peso = formatPeso;

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  function run(action: (formData: FormData) => Promise<CancellationActionResult>, formData: FormData, onSuccess?: () => void) {
    startTransition(async () => {
      const response = await action(formData);
      setResult(response.success ? { tone: "success", text: response.message ?? "Saved." } : { tone: "error", text: response.error ?? "Something went wrong." });
      if (response.success) {
        onSuccess?.();
        router.refresh();
      }
    });
  }
  return { pending, result, run };
}

/** A tourist asked to cancel: the operator approves (booking cancelled) or declines with a note. */
export function CancellationReview({ bookingId, request, late }: { bookingId: string; request: CancellationRequest; late: boolean }) {
  const { pending, result, run } = useAction();
  const [notes, setNotes] = useState("");

  function decide(decision: "approve" | "decline") {
    const formData = new FormData();
    formData.set("cancellationId", request.id);
    formData.set("bookingId", bookingId);
    formData.set("decision", decision);
    formData.set("notes", notes);
    run(resolveCancellationRequest, formData);
  }

  return (
    <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
      <p className="mb-2 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-rose-900">
        Cancellation requested
        {late ? <Badge tone="warning">Within 48 hours of the tour</Badge> : null}
      </p>
      <p className="text-sm text-daet-ink">“{request.reason}”</p>
      <p className="mt-1 text-xs text-daet-ink/70">
        Asked on {new Date(request.requested_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })}
      </p>
      {result ? <Notice variant={result.tone} className="mt-3">{result.text}</Notice> : null}
      <Field id={`cancel-notes-${request.id}`} label="Note to the tourist" hint="Required when declining." className="mt-3">
        <Textarea
          id={`cancel-notes-${request.id}`}
          rows={2}
          maxLength={500}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="e.g. Approved — refund will be sent to your GCash within 3 days."
        />
      </Field>
      <div className="mt-3 flex flex-wrap gap-3">
        <Button onClick={() => decide("approve")} loading={pending}>
          Approve cancellation
        </Button>
        <Button variant="danger" onClick={() => decide("decline")} disabled={pending}>
          Decline request
        </Button>
      </div>
    </div>
  );
}

/** Shown on cancelled/declined bookings that still hold money the tourist paid. */
export function RefundPanel({ bookingId, refundable }: { bookingId: string; refundable: number }) {
  const { pending, result, run } = useAction();
  const [formKey, setFormKey] = useState(0);

  return (
    <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-sky-900">Refund due</p>
      <p className="mt-1 text-sm text-daet-ink">
        The tourist paid <strong>{peso(refundable)}</strong> that has not been refunded yet. Send the refund, then record it here.
      </p>
      {result ? <Notice variant={result.tone} className="mt-3">{result.text}</Notice> : null}
      <form
        key={formKey}
        className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          formData.set("bookingId", bookingId);
          run(recordRefund, formData, () => setFormKey((key) => key + 1));
        }}
      >
        <Field id={`refund-amount-${bookingId}`} label="Amount (₱)" required>
          <Input id={`refund-amount-${bookingId}`} name="amount" inputMode="decimal" defaultValue={refundable.toFixed(2)} required />
        </Field>
        <Field id={`refund-method-${bookingId}`} label="Sent via" required>
          <Select id={`refund-method-${bookingId}`} name="method" defaultValue="gcash" required>
            <option value="gcash">GCash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="cash">Cash</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field id={`refund-ref-${bookingId}`} label="Reference no.">
          <Input id={`refund-ref-${bookingId}`} name="reference" maxLength={60} />
        </Field>
        <Button type="submit" loading={pending} loadingText="Saving…">
          Record refund
        </Button>
      </form>
    </div>
  );
}
