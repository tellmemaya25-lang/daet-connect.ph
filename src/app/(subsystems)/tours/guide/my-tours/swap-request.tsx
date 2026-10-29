"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { BUSY_LABELS, SWAP_REASON_MAX, SWAP_STATUS_LABELS, type BusyReason } from "@/lib/tours/guide-swap";
import { cancelGuideSwap, requestGuideSwap } from "../../guide-swap-actions";

export type MySwap = { id: string; status: string; toGuideName: string | null; reason: string; decisionNote: string | null };

/**
 * R6: on an upcoming assigned tour, the guide suggests another guide (or lets
 * the operator choose). The operator approves or declines.
 */
export function SwapRequest({
  bookingId,
  reference,
  guides,
  latest,
}: {
  bookingId: string;
  reference: string;
  /** Other approved guides with why each can't take the date (null = free). */
  guides: Array<{ id: string; full_name: string; reason: BusyReason | null }>;
  latest: MySwap | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [toGuide, setToGuide] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const idBase = `swap-${bookingId}`;

  const run = (action: () => Promise<{ success: boolean; message?: string; error?: string }>) =>
    startTransition(async () => {
      const response = await action();
      setResult(response.success ? { tone: "success", text: response.message ?? "Saved." } : { tone: "error", text: response.error ?? "Something went wrong." });
      if (response.success) {
        setOpen(false);
        setReason("");
        router.refresh();
      }
    });

  if (latest?.status === "pending") {
    return (
      <div className="mt-4 rounded-2xl border border-yellow-200 bg-yellow-50/60 p-4 text-sm">
        <p className="font-bold text-daet-ink">
          Swap requested{latest.toGuideName ? ` to ${latest.toGuideName}` : ""}: {SWAP_STATUS_LABELS.pending.toLowerCase()}.
        </p>
        <p className="mt-1 text-daet-ink/80">“{latest.reason}”</p>
        <Button type="button" variant="secondary" className="mt-3" onClick={() => run(() => cancelGuideSwap(latest.id))} disabled={pending}>
          Withdraw request
        </Button>
        {result ? <Notice variant={result.tone} className="mt-3">{result.text}</Notice> : null}
      </div>
    );
  }

  return (
    <div className="mt-4">
      {latest?.status === "rejected" ? (
        <p className="mb-2 text-sm text-daet-ink/80">
          Your last swap request was declined{latest.decisionNote ? `: “${latest.decisionNote}”` : "."}
        </p>
      ) : null}
      {!open ? (
        <Button type="button" variant="secondary" onClick={() => setOpen(true)} aria-expanded={false} aria-controls={`${idBase}-form`}>
          Suggest another guide
        </Button>
      ) : (
        <form
          id={`${idBase}-form`}
          aria-label={`Suggest another guide for ${reference}`}
          className="space-y-3 rounded-2xl border border-daet-ink/10 bg-daet-sand/30 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData();
            formData.set("bookingId", bookingId);
            formData.set("toGuideId", toGuide);
            formData.set("reason", reason);
            run(() => requestGuideSwap(formData));
          }}
        >
          <Field id={`${idBase}-guide`} label="Who could take it?" hint="Only guides free that day can be picked.">
            <Select id={`${idBase}-guide`} value={toGuide} onChange={(e) => setToGuide(e.target.value)} disabled={pending}>
              <option value="">Let the operator choose</option>
              {guides.map((g) => (
                <option key={g.id} value={g.id} disabled={Boolean(g.reason)}>
                  {g.full_name}
                  {g.reason ? ` (${BUSY_LABELS[g.reason]})` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field id={`${idBase}-reason`} label="Why?" required hint={`The operator sees this. Up to ${SWAP_REASON_MAX} characters.`}>
            <Textarea id={`${idBase}-reason`} rows={3} maxLength={SWAP_REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} required disabled={pending} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={pending} disabled={pending || reason.trim().length < 3}>
              Send to operator
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {result ? <Notice variant={result.tone} className="mt-3">{result.text}</Notice> : null}
    </div>
  );
}
