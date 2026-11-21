"use client";

import type { ReactNode } from "react";
import { useFeedback } from "@/components/ui/feedback";

/** Submit button that asks for confirmation (in a dialog) before a destructive action. */
export function ConfirmSubmitButton({
  message,
  confirmLabel = "Yes, continue",
  className,
  children,
}: {
  message: string;
  confirmLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  const { confirm } = useFeedback();
  return (
    <button
      type="submit"
      className={className}
      onClick={async (event) => {
        const button = event.currentTarget;
        const form = button.form;
        // Hold the submit, ask, then submit this same button once confirmed.
        event.preventDefault();
        if (!form) return;
        if (await confirm({ title: message, confirmLabel, confirmVariant: "danger" })) form.requestSubmit(button);
      }}
    >
      {children}
    </button>
  );
}
