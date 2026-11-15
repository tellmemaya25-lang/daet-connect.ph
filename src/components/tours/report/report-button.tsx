"use client";

import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { REPORT_REASONS, type ReportTarget } from "@/lib/tours/admin-moderation";
import { submitReport } from "@/app/(subsystems)/tours/reports-actions";

/** A small "Report" disclosure: pick a reason, add details, send. One server call per report. */
export function ReportButton({ type, targetId, label = "Report" }: { type: ReportTarget; targetId: string; label?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  if (sent) return <p role="status" className="text-sm text-daet-ink/70">Thanks. The Tourism Office will look into it.</p>;
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center text-sm font-bold text-daet-ink/70 underline-offset-4 hover:underline">
        {label}
      </button>
    );

  const send = () =>
    startTransition(async () => {
      const result = await submitReport(type, targetId, reason, details);
      if (!result.success) return setError(result.error ?? "Your report could not be sent.");
      setSent(true);
    });

  return (
    <section aria-label="Report to the Tourism Office" className="mt-2 rounded-2xl border border-line p-4" aria-busy={pending}>
      <Field id={`${id}-reason`} label="What is wrong?">
        <Select value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Choose a reason</option>
          {REPORT_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={`${id}-details`} label="Details (optional)" className="mt-3">
        <Textarea rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
      </Field>
      {error ? (
        <Notice variant="error" className="mt-2">
          {error}
        </Notice>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" onClick={send} disabled={pending || !reason}>
          Send report
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
