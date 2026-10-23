"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { isBookingStatus, operatorActions, type OperatorAction } from "@/lib/tours/booking-lifecycle";
import { updateBookingStatus } from "./actions";

type BookingActionButtonsProps = {
  bookingId: string;
  currentStatus: string;
  tourDate: string;
  totalPaid: number;
  /** Today in Manila (YYYY-MM-DD), from the server so client clocks don't matter. */
  today: string;
};

export function BookingActionButtons({ bookingId, currentStatus, tourDate, totalPaid, today }: BookingActionButtonsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<OperatorAction | null>(null);
  const [reason, setReason] = useState("");

  if (!isBookingStatus(currentStatus)) return null;
  const actions = operatorActions(currentStatus, { tourDate, today, totalPaid });
  const waitingForTourDate = currentStatus === "confirmed" && tourDate > today;

  if (actions.length === 0) return null;

  function submit(action: OperatorAction) {
    setError(null);
    startTransition(async () => {
      const result = await updateBookingStatus(bookingId, action.to, action.needsReason ? reason : undefined);
      if (!result.success) {
        setError(result.error || "Failed to update booking");
        return;
      }
      setActive(null);
      setReason("");
      router.refresh();
    });
  }

  return (
    <div>
      {error && !active ? <Notice variant="error" className="mb-3">{error}</Notice> : null}

      <div className="flex flex-wrap gap-3">
        {actions.map((action) => (
          <Button key={action.to} variant={action.variant} onClick={() => { setError(null); setActive(action); }} disabled={pending}>
            {action.label}
          </Button>
        ))}
      </div>
      {waitingForTourDate ? (
        <p className="mt-2 text-xs text-daet-ink/55">You can mark this tour completed on or after the tour date.</p>
      ) : null}

      <Modal
        open={active !== null}
        onClose={() => { if (!pending) setActive(null); }}
        title={active?.label ?? ""}
        description={active?.confirm}
        footer={
          <>
            <Button variant="ghost" onClick={() => setActive(null)} disabled={pending}>
              Keep as is
            </Button>
            <Button
              variant={active?.variant === "danger" ? "danger" : "primary"}
              loading={pending}
              loadingText="Saving…"
              onClick={() => active && submit(active)}
            >
              {active?.label}
            </Button>
          </>
        }
      >
        {error ? <Notice variant="error" className="mb-3">{error}</Notice> : null}
        {active?.needsReason ? (
          <Field id={`reason-${bookingId}`} label="Reason for the tourist" required hint="Shown on the tourist's booking page.">
            <Textarea
              id={`reason-${bookingId}`}
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. The boat is under repair on this date."
            />
          </Field>
        ) : null}
      </Modal>
    </div>
  );
}
