"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { announceOverlay } from "@/lib/ui-overlay";

/**
 * Open state for a header popover (a button plus the panel it shows). Closes
 * on Escape (focus back on the button), a click outside, and navigation, and
 * tells floating buttons when it covers the screen.
 */
export function usePopover(id: string) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => announceOverlay(id, open), [id, open]);
  useEffect(() => () => announceOverlay(id, false), [id]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return { open, setOpen, toggle: () => setOpen((v) => !v), rootRef, buttonRef };
}
