"use client";

import type { ReactNode } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";

/** Opens a <details> section further down the page and scrolls to it. */
export function OpenDetailsButton({
  targetId,
  variant = "secondary",
  fullWidth = false,
  children,
}: {
  targetId: string;
  variant?: ButtonVariant;
  fullWidth?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      variant={variant}
      fullWidth={fullWidth}
      aria-controls={targetId}
      onClick={() => {
        const target = document.getElementById(targetId);
        if (!(target instanceof HTMLDetailsElement)) return;
        target.open = true;
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        target.querySelector("summary")?.focus({ preventScroll: true });
      }}
    >
      {children}
    </Button>
  );
}
