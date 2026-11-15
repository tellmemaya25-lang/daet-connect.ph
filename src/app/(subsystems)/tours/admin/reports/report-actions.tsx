"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { BAN_CHOICES } from "@/lib/tours/admin-moderation";
import { setReviewHidden } from "@/app/(subsystems)/tours/reviews/actions";
import { banAccount, resolveReport } from "./actions";

/**
 * What an admin can do with one report: hide the review, ban the account
 * (7 days, 30 days, or until lifted), then close it as acted on or dismissed.
 */
export function ReportActions({ reportId, reviewId, reviewHidden, profileId, profileName, canBan }: { reportId: string; reviewId: string | null; reviewHidden: boolean; profileId: string | null; profileName: string; canBan: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (task: () => Promise<{ ok: boolean; message: string }>) =>
    startTransition(async () => {
      const r = await task();
      setResult(r);
      if (r.ok) router.refresh();
    });

  const hide = () =>
    run(async () => {
      const form = new FormData();
      form.set("reviewId", reviewId ?? "");
      form.set("hidden", "true");
      form.set("reason", note.trim() || "Reported and reviewed by the Tourism Office");
      const r = await setReviewHidden(form);
      return r.success ? { ok: true, message: "Review hidden." } : { ok: false, message: r.error ?? "The review could not be hidden." };
    });

  return (
    <div className="mt-3 space-y-3" aria-busy={pending}>
      <Field id={`note-${reportId}`} label="Note (shown in the log; used as the ban or hide reason)">
        <Input maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        {reviewId && !reviewHidden ? (
          <Button type="button" variant="danger" disabled={pending} onClick={hide}>
            Hide review
          </Button>
        ) : null}
        {canBan && profileId
          ? BAN_CHOICES.map((b) => (
              <Button key={b.label} type="button" variant="secondary" disabled={pending} onClick={() => run(() => banAccount(profileId, b.days, note || "Reported and reviewed by the Tourism Office"))} aria-label={`Ban ${b.label.toLowerCase()} for ${profileName}`}>
                Ban {b.label.toLowerCase()}
              </Button>
            ))
          : null}
        <Button type="button" disabled={pending} onClick={() => run(() => resolveReport(reportId, "actioned", note))}>
          Close: acted on
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => resolveReport(reportId, "dismissed", note))}>
          Dismiss
        </Button>
      </div>
      {result ? <Notice variant={result.ok ? "success" : "error"}>{result.message}</Notice> : null}
    </div>
  );
}
