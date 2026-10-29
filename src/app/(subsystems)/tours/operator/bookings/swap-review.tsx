"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { BUSY_LABELS, SWAP_REASON_MAX, type BusyReason } from "@/lib/tours/guide-swap";
import { decideGuideSwap } from "../../guide-swap-actions";

export type PendingSwap = {
  id: string;
  fromGuideId: string;
  fromGuideName: string;
  toGuideId: string | null;
  toGuideName: string | null;
  reason: string;
  createdAt: string;
};

/** R6: a guide's swap request on a booking, for the operator to approve or decline. */
export function SwapReview({
  swap,
  guides,
}: {
  swap: PendingSwap;
  /** Approved guides with why each can't take the date (null = free). */
  guides: Array<{ id: string; full_name: string; reason: BusyReason | null }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [guideId, setGuideId] = useState(swap.toGuideId ?? "");
  const [note, setNote] = useState("");

  function submit(decision: "approve" | "reject") {
    const formData = new FormData();
    formData.set("requestId", swap.id);
    formData.set("decision", decision);
    if (decision === "approve" && guideId) formData.set("guideId", guideId);
    if (note.trim()) formData.set("note", note);
    startTransition(async () => {
      const response = await decideGuideSwap(formData);
      setResult(response.success ? { tone: "success", text: response.message ?? "Saved." } : { tone: "error", text: response.error ?? "Something went wrong." });
      if (response.success) router.refresh();
    });
  }

  const choices = guides.filter((g) => g.id !== swap.fromGuideId);

  return (
    <section aria-label="Guide swap request" className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <p className="text-sm font-bold text-daet-ink">
        {swap.fromGuideName} asks to hand this tour to {swap.toGuideName ?? "another guide"}
      </p>
      <p className="mt-1 text-sm text-daet-ink/80">“{swap.reason}”</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field id={`swap-guide-${swap.id}`} label="New guide">
          <Select id={`swap-guide-${swap.id}`} value={guideId} onChange={(e) => setGuideId(e.target.value)} disabled={pending}>
            <option value="">Choose a guide…</option>
            {choices.map((g) => (
              <option key={g.id} value={g.id} disabled={Boolean(g.reason)}>
                {g.full_name}
                {g.reason ? ` (${BUSY_LABELS[g.reason]})` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`swap-note-${swap.id}`} label="Note to the guide (optional)">
          <Textarea id={`swap-note-${swap.id}`} rows={2} maxLength={SWAP_REASON_MAX} value={note} onChange={(e) => setNote(e.target.value)} disabled={pending} />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" onClick={() => submit("approve")} disabled={pending || !guideId} loading={pending}>
          Approve swap
        </Button>
        <Button type="button" variant="secondary" onClick={() => submit("reject")} disabled={pending}>
          Decline
        </Button>
      </div>
      {result ? (
        <Notice variant={result.tone} className="mt-3">
          {result.text}
        </Notice>
      ) : null}
    </section>
  );
}
