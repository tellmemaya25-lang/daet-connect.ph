"use client";

import { useState } from "react";
import { ResultLine, ShareExamples, useApplicationAction } from "@/components/tours/application-bits";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { pctText, type GuideApplication } from "@/lib/tours/guide-applications";
import { answerOffer, applyToOperator, confirmInterview, endAgreementAsGuide, withdrawApplication } from "./actions";

/** Apply to one operator, with an optional note about yourself. */
export function ApplyForm({ operatorId, operatorName }: { operatorId: string; operatorName: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const { pending, result, run } = useApplicationAction();
  const id = `apply-${operatorId}`;
  if (result?.ok) return <ResultLine result={result} />;
  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)} aria-label={`Apply to ${operatorName}`}>
        Apply
      </Button>
    );
  }
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => applyToOperator(operatorId, message));
      }}
    >
      <Field id={id} label={`Message to ${operatorName}`} hint="Optional: your experience, languages and the places you know.">
        <Textarea value={message} maxLength={1000} rows={3} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send application"}
        </Button>
        <Button variant="ghost" type="button" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <ResultLine result={result} />
    </form>
  );
}

/** The guide's next step on one application: confirm the interview, answer an offer, withdraw or end. */
export function GuideApplicationActions({ app, operatorName }: { app: GuideApplication; operatorName: string }) {
  const { pending, result, run } = useApplicationAction();
  const [ending, setEnding] = useState(false);
  const [note, setNote] = useState("");
  const canWithdraw = ["applied", "interview_scheduled", "interview_passed", "offered"].includes(app.status);
  const offer = app.offeredPct !== null && (app.status === "offered" || app.status === "active") ? app.offeredPct : null;

  return (
    <div className="space-y-3">
      {offer !== null ? (
        <div className="space-y-2 rounded-xl bg-blue-50 p-3 dark:bg-blue-950/40">
          <p className="font-bold text-daet-ink">
            {app.status === "active" ? `${operatorName} offers a new share: ${pctText(offer)}` : `${operatorName} offers you ${pctText(offer)} of the tour price`}
            {app.status === "active" && app.sharePct ? ` (now ${pctText(app.sharePct)})` : ""}
          </p>
          <ShareExamples pct={offer} />
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} onClick={() => run(() => answerOffer(app.id, true))}>
              Accept {pctText(offer)}
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => run(() => answerOffer(app.id, false))}>
              Decline
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {app.status === "interview_scheduled" && !app.interviewConfirmed ? (
          <Button disabled={pending} onClick={() => run(() => confirmInterview(app.id))}>
            I&apos;ll attend
          </Button>
        ) : null}
        {canWithdraw ? (
          <Button variant="ghost" disabled={pending} onClick={() => run(() => withdrawApplication(app.id))}>
            Withdraw application
          </Button>
        ) : null}
        {app.status === "active" && !ending ? (
          <Button variant="ghost" disabled={pending} onClick={() => setEnding(true)}>
            End agreement
          </Button>
        ) : null}
      </div>

      {ending ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => endAgreementAsGuide(app.id, note));
          }}
        >
          <Field id={`end-${app.id}`} label="Reason (optional)" hint={`${operatorName} sees this. Tours you already have stay with you.`}>
            <Textarea value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" type="submit" disabled={pending}>
              End agreement
            </Button>
            <Button variant="ghost" type="button" disabled={pending} onClick={() => setEnding(false)}>
              Keep it
            </Button>
          </div>
        </form>
      ) : null}
      <ResultLine result={result} />
    </div>
  );
}
