"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { startOnlinePayment, type CheckoutActionState } from "./payment-actions";

const INITIAL: CheckoutActionState = { error: null };

export function OnlinePayButton({
  bookingId,
  amountLabel,
  part = "balance",
  label,
  variant = "primary",
  note = true,
}: {
  bookingId: string;
  amountLabel: string;
  /** "deposit" pays only the reservation fee. */
  part?: "balance" | "deposit";
  label?: string;
  variant?: "primary" | "secondary";
  note?: boolean;
}) {
  const [state, formAction, pending] = useActionState(startOnlinePayment, INITIAL);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="part" value={part} />
      {state.error ? <Notice variant="error">{state.error}</Notice> : null}
      <Button type="submit" size="lg" variant={variant} fullWidth loading={pending} loadingText="Opening secure checkout…">
        {label ?? `Pay ${amountLabel} online`}
      </Button>
      {note ? <p className="text-center text-sm text-slate-600 dark:text-slate-400">GCash, Maya or card via PayMongo. You&apos;ll return here after paying.</p> : null}
    </form>
  );
}
