"use client";

import { useState, useTransition, type FormEvent } from "react";
import { INITIAL_PROMO_FORM_STATE, type PromoFormState } from "@/lib/tours/promo-validation";

/**
 * Submits through a transition instead of `<form action>` so React does not
 * reset the uncontrolled fields when the server returns validation errors.
 * On success the Server Action redirects, which navigates away.
 */
export function usePromoForm(action: (prev: PromoFormState, formData: FormData) => Promise<PromoFormState>) {
  const [state, setState] = useState<PromoFormState>(INITIAL_PROMO_FORM_STATE);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const next = await action(state, formData);
      setState(next);
      if (next.message) window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  return { state, pending, onSubmit };
}
