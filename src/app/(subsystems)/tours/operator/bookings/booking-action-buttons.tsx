"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LineIcon } from "@/components/ui/icons";
import { Field, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { usePopover } from "@/components/ui/use-popover";
import { isBookingStatus, operatorActions, type OperatorAction } from "@/lib/tours/booking-lifecycle";
import { updateBookingStatus } from "./actions";

type BookingActionButtonsProps = {
  bookingId: string;
  currentStatus: string;
  tourDate: string;
  totalPaid: number;
  /** Today in Manila (YYYY-MM-DD), from the server so client clocks don't matter. */
  today: string;
  bookingReference: string;
  contactName: string;
  /** Quiet actions (messages) shown beside the main one. */
  children?: ReactNode;
};

/**
 * One main button for what the booking needs next; Decline and Cancel wait in
 * a More menu and confirm in a dialog that names the booking and the tourist.
 */
export function BookingActionButtons({ bookingId, currentStatus, tourDate, totalPaid, today, bookingReference, contactName, children }: BookingActionButtonsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<OperatorAction | null>(null);
  const [reason, setReason] = useState("");
  const more = usePopover(`booking-more-${bookingId}`);

  const actions = isBookingStatus(currentStatus) ? operatorActions(currentStatus, { tourDate, today, totalPaid }) : [];
  const main = actions.filter((action) => action.variant !== "danger");
  const risky = actions.filter((action) => action.variant === "danger");
  const waitingForTourDate = currentStatus === "confirmed" && tourDate > today;

  if (actions.length === 0 && !children) return null;

  function choose(action: OperatorAction) {
    setError(null);
    more.setOpen(false);
    setActive(action);
  }

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

      <div ref={more.rootRef}>
        <div className="flex flex-wrap items-start gap-2">
          {main.map((action) => (
            <Button key={action.to} variant="primary" onClick={() => choose(action)} disabled={pending}>
              {action.label}
            </Button>
          ))}
          {children}
          {risky.length > 0 ? (
            <Button
              ref={more.buttonRef}
              variant="ghost"
              aria-expanded={more.open}
              aria-controls={`booking-more-${bookingId}`}
              onClick={more.toggle}
              disabled={pending}
            >
              More
              <LineIcon name="chevron-down" className={`h-4 w-4 transition-transform ${more.open ? "rotate-180" : ""}`} />
            </Button>
          ) : null}
        </div>
        {more.open ? (
          <ul id={`booking-more-${bookingId}`} className="mt-2 max-w-xs overflow-hidden rounded-2xl bg-canvas p-1">
            {risky.map((action) => (
              <li key={action.to}>
                <button
                  type="button"
                  onClick={() => choose(action)}
                  className="flex min-h-11 w-full items-center rounded-xl px-3 text-left font-bold text-red-700 transition-colors hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                >
                  {action.label}…
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {waitingForTourDate ? (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">You can mark this tour completed on or after the tour date.</p>
      ) : null}

      <Modal
        open={active !== null}
        onClose={() => { if (!pending) setActive(null); }}
        title={active ? (active.variant === "danger" ? `${active.label} ${bookingReference} for ${contactName}?` : active.label) : ""}
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
