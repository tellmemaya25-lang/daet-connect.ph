"use client";

import { useState } from "react";
import { ResultLine, ShareExamples, useApplicationAction } from "@/components/tours/application-bits";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { parseSharePct, pctText, type GuideApplication } from "@/lib/tours/guide-applications";
import { declineApplication, endAgreementAsOperator, offerShare, recordInterview, scheduleInterview } from "./actions";

type Panel = null | "interview" | "result" | "offer" | "decline" | "end";

/** "2026-12-01T14:30" for an ISO time, in Manila, for the date-time picker. */
function manilaLocal(iso: string | null): string {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 16);
}

/** The operator's next steps on one guide's application or agreement. */
export function OperatorApplicationActions({ app, guideName }: { app: GuideApplication; guideName: string }) {
  const { pending, result, run } = useApplicationAction();
  const [panel, setPanel] = useState<Panel>(null);
  const [when, setWhen] = useState(manilaLocal(app.interviewAt));
  const [place, setPlace] = useState(app.interviewPlace ?? "");
  const [link, setLink] = useState(app.interviewLink ?? "");
  const [notes, setNotes] = useState("");
  const [pct, setPct] = useState(app.offeredPct ? String(app.offeredPct) : "");
  const [note, setNote] = useState("");
  const parsedPct = parseSharePct(pct);
  const toggle = (p: Panel) => setPanel((open) => (open === p ? null : p));
  const id = (part: string) => `${part}-${app.id}`;

  const canSchedule = app.status === "applied" || app.status === "interview_scheduled";
  const canRecord = app.status === "interview_scheduled";
  const canOffer = ["interview_passed", "offered", "offer_declined", "active"].includes(app.status);
  const canDecline = ["applied", "interview_scheduled", "interview_passed", "offered", "offer_declined"].includes(app.status);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canSchedule ? (
          <Button variant={app.status === "applied" ? "primary" : "secondary"} disabled={pending} aria-expanded={panel === "interview"} onClick={() => toggle("interview")}>
            {app.status === "applied" ? "Set interview" : "Move interview"}
          </Button>
        ) : null}
        {canRecord ? (
          <Button disabled={pending} aria-expanded={panel === "result"} onClick={() => toggle("result")}>
            Record interview result
          </Button>
        ) : null}
        {canOffer ? (
          <Button variant={app.status === "active" ? "secondary" : "primary"} disabled={pending} aria-expanded={panel === "offer"} onClick={() => toggle("offer")}>
            {app.status === "active" ? "Offer a new share" : app.status === "offered" ? "Change offer" : "Offer a share"}
          </Button>
        ) : null}
        {canDecline ? (
          <Button variant="ghost" disabled={pending} aria-expanded={panel === "decline"} onClick={() => toggle("decline")}>
            Decline
          </Button>
        ) : null}
        {app.status === "active" ? (
          <Button variant="ghost" disabled={pending} aria-expanded={panel === "end"} onClick={() => toggle("end")}>
            End agreement
          </Button>
        ) : null}
      </div>

      {panel === "interview" ? (
        <form
          className="grid gap-3 rounded-xl bg-canvas p-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => scheduleInterview(app.id, when, place, link));
          }}
        >
          <Field id={id("when")} label="Date and time" hint="Manila time." required className="sm:col-span-2">
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
          </Field>
          <Field id={id("place")} label="Place" hint="Your office or a meeting spot.">
            <Input value={place} maxLength={200} onChange={(e) => setPlace(e.target.value)} />
          </Field>
          <Field id={id("link")} label="Online meeting link" hint="Optional, https://">
            <Input type="url" inputMode="url" value={link} maxLength={500} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Send to the guide"}
            </Button>
          </div>
        </form>
      ) : null}

      {panel === "result" ? (
        <div className="space-y-2 rounded-xl bg-canvas p-3">
          <Field id={id("notes")} label="Notes" hint="Only you see these.">
            <Textarea value={notes} maxLength={1000} rows={2} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} onClick={() => run(() => recordInterview(app.id, true, notes))}>
              Passed
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => run(() => recordInterview(app.id, false, notes))}>
              Not accepted
            </Button>
          </div>
        </div>
      ) : null}

      {panel === "offer" ? (
        <form
          className="space-y-2 rounded-xl bg-canvas p-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => offerShare(app.id, pct));
          }}
        >
          <Field
            id={id("pct")}
            label={`${guideName}'s share of the tour price (%)`}
            hint={app.status === "active" && app.sharePct ? `Now ${pctText(app.sharePct)}. The new share applies to tours assigned after the guide accepts.` : "The guide's fee on each tour you assign them. Pickup fees aren't counted."}
            error={pct && !parsedPct.ok ? parsedPct.error : undefined}
            required
          >
            <Input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="30" className="w-32" />
          </Field>
          {parsedPct.ok ? <ShareExamples pct={parsedPct.value} /> : null}
          <Button type="submit" disabled={pending || !parsedPct.ok}>
            {pending ? "Sending…" : "Send offer"}
          </Button>
        </form>
      ) : null}

      {panel === "decline" || panel === "end" ? (
        <form
          className="space-y-2 rounded-xl bg-canvas p-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => (panel === "end" ? endAgreementAsOperator(app.id, note) : declineApplication(app.id, note)));
          }}
        >
          <Field
            id={id("note")}
            label="Note to the guide (optional)"
            hint={panel === "end" ? "Tours they already have stay with them. You won't be able to assign them new ones." : undefined}
          >
            <Textarea value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button variant="danger" type="submit" disabled={pending}>
            {panel === "end" ? "End agreement" : "Decline application"}
          </Button>
        </form>
      ) : null}
      <ResultLine result={result} />
    </div>
  );
}
