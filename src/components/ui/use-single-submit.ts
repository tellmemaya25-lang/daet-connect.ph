"use client";

import { useEffect, useRef, type FormEvent } from "react";

/**
 * An `onSubmit` for a form driven by `useActionState`: while one submission is
 * in flight, further ones are dropped instead of queued.
 *
 * React queues every submission of an action form and runs them one after the
 * other, so a double click or a second Enter before the button disables itself
 * would reach the server twice. On the sign-up and resend forms each of those
 * is an email taken from the site's small hourly email quota.
 *
 * `result` is the action's state. The ref is set synchronously on the first
 * submit, so it also catches a second event that arrives before React has
 * re-rendered with `pending` true.
 */
export function useSingleSubmit(pending: boolean, result: unknown) {
  const inFlight = useRef(false);

  // Each finished submission hands back a new result; that, with `pending`
  // false, is when the form may be sent again.
  useEffect(() => {
    if (!pending) inFlight.current = false;
  }, [pending, result]);

  return (event: FormEvent<HTMLFormElement>) => {
    if (inFlight.current || pending) {
      event.preventDefault();
      return;
    }
    inFlight.current = true;
  };
}
