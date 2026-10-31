"use client";

import { useEffect, useRef } from "react";

/** Distance (px) or speed (px/ms) past which a release dismisses the sheet. */
const DISTANCE = 96;
const VELOCITY = 0.5;

/**
 * Swipe a phone sheet away with a finger: `down` for a sheet above the tab
 * bar, `up` for one hanging from the header. The sheet follows the finger
 * (with resistance the wrong way), then either leaves the way it was flung or
 * springs back. Taps still reach links; the click after a drag is swallowed.
 * Mouse input is ignored. Put `touch-action: none` on the handle.
 */
export function useDragDismiss<Sheet extends HTMLElement, Handle extends HTMLElement = Sheet>(
  direction: "down" | "up",
  onDismiss: () => void,
  /** Whether the sheet is on the page (re-binds when it mounts). */
  active = true,
) {
  const sheetRef = useRef<Sheet>(null);
  const handleRef = useRef<Handle>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const sheet = sheetRef.current;
    const handle = (handleRef.current as HTMLElement | null) ?? sheet;
    if (!sheet || !handle) return;
    const sign = direction === "down" ? 1 : -1;
    let pointerId = -1;
    let startY = 0;
    let startT = 0;
    let offset = 0;
    let tracking = false;
    let dragging = false;

    const place = (y: number, transition: string, opacity = "") => {
      sheet.style.transition = transition;
      sheet.style.transform = y ? `translateY(${y}px)` : "";
      sheet.style.opacity = opacity;
    };
    const swallowClick = () => {
      const stop = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
      };
      sheet.addEventListener("click", stop, { capture: true, once: true });
      window.setTimeout(() => sheet.removeEventListener("click", stop, { capture: true }), 0);
    };

    const onDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" || !event.isPrimary) return;
      tracking = true;
      dragging = false;
      pointerId = event.pointerId;
      startY = event.clientY;
      startT = event.timeStamp;
      offset = 0;
    };
    const onMove = (event: PointerEvent) => {
      if (!tracking || event.pointerId !== pointerId) return;
      const dy = event.clientY - startY;
      if (!dragging) {
        if (Math.abs(dy) < 6) return;
        dragging = true;
        try {
          handle.setPointerCapture(pointerId);
        } catch {
          // The pointer is already gone; the drag still follows the events we get.
        }
      }
      // Free in the dismiss direction, heavy the other way.
      offset = dy * sign > 0 ? dy : dy * 0.2;
      place(offset, "none");
    };
    const onEnd = (event: PointerEvent) => {
      if (!tracking || event.pointerId !== pointerId) return;
      tracking = false;
      if (!dragging) return;
      swallowClick();
      const distance = offset * sign;
      const velocity = distance / Math.max(1, event.timeStamp - startT);
      if (event.type !== "pointercancel" && (distance > Math.min(DISTANCE, sheet.offsetHeight * 0.3) || velocity > VELOCITY)) {
        // Leave the way it was flung.
        place(sign * sheet.offsetHeight, "transform 200ms var(--ease-out), opacity 200ms var(--ease-out)", "0");
        window.setTimeout(() => {
          dismissRef.current();
          place(0, "none");
        }, 200);
      } else {
        place(0, "transform 300ms var(--ease-drawer)");
      }
    };

    handle.addEventListener("pointerdown", onDown);
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onEnd);
    handle.addEventListener("pointercancel", onEnd);
    return () => {
      handle.removeEventListener("pointerdown", onDown);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onEnd);
      handle.removeEventListener("pointercancel", onEnd);
    };
  }, [direction, active]);

  return { sheetRef, handleRef };
}
