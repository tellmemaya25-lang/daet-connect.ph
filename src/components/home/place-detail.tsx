"use client";

import React, { useRef } from "react";
import { ButtonLink } from "@/components/ui/button";
import type { FanPlace } from "./fan-places";

/** A downward drag longer than this dismisses the phone sheet. */
const DISMISS_AFTER = 80;

/**
 * What opens over the fan: the place's name, where it sits in the six, what it
 * is, and the two things a visitor can do next.
 *
 * A panel from the right on a desktop, a sheet from the bottom on a phone,
 * where dragging it down closes it as well as the ✕. Text sits on the flat
 * surface colour, never on a gradient, so contrast is the same everywhere; the
 * ✕ and the arrows are 48px targets.
 */
export function PlaceDetail({
  place,
  index,
  total,
  phone,
  headingRef,
  onClose,
  onPrev,
  onNext,
}: {
  place: FanPlace;
  index: number;
  total: number;
  phone: boolean;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const dragStart = useRef<number | null>(null);
  const position = index + 1;

  const onTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    if (!phone) return;
    dragStart.current = event.touches[0].clientY;
  };

  const onTouchMove = (event: React.TouchEvent<HTMLElement>) => {
    if (!phone || dragStart.current === null) return;
    const panel = panelRef.current;
    if (!panel) return;

    const moved = Math.max(0, event.touches[0].clientY - dragStart.current);
    panel.style.transition = "none";
    panel.style.transform = `translateY(${moved}px)`;
  };

  const onTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    if (!phone || dragStart.current === null) return;
    const moved = event.changedTouches[0].clientY - dragStart.current;
    dragStart.current = null;

    const panel = panelRef.current;
    if (panel) {
      panel.style.transition = "transform 200ms ease-out";
      panel.style.transform = moved > DISMISS_AFTER ? "translateY(100%)" : "";
    }
    if (moved > DISMISS_AFTER) onClose();
  };

  return (
    <section
      ref={panelRef}
      data-detail
      aria-labelledby="place-detail-title"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className={
        phone
          ? "pointer-events-auto absolute inset-x-0 bottom-0 z-20 max-h-[72%] overflow-y-auto overscroll-contain rounded-t-2xl bg-surface p-5 pb-8"
          : "pointer-events-auto absolute inset-y-0 right-0 z-20 w-full max-w-md overflow-y-auto overscroll-contain bg-surface p-6 sm:p-8"
      }
    >
      {phone && (
        <div aria-hidden="true" className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-strong" />
      )}

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-daet-ink/70">
            {position} of {total}
          </p>
          <h2
            id="place-detail-title"
            ref={headingRef}
            tabIndex={-1}
            className="display-2 mt-1 text-daet-ink outline-none"
          >
            {place.name}
          </h2>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-muted text-daet-ink transition hover:bg-muted-strong"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {place.tag && (
        <p className="mt-3 inline-block rounded-full bg-daet-sand px-3 py-1 text-xs font-bold text-daet-forest dark:text-blue-300">
          {place.tag}
        </p>
      )}

      <p className="mt-3 text-base leading-relaxed text-daet-ink">{place.text}</p>

      <div className="mt-5 flex flex-wrap gap-2">
        <ButtonLink href={place.href}>See the place</ButtonLink>
        <ButtonLink href={place.toursHref} variant="secondary">
          Trips near here
        </ButtonLink>
      </div>

      <div className="mt-6 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onPrev}
          aria-label="Previous place"
          className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-daet-ink transition hover:bg-muted-strong"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <button
          type="button"
          onClick={onNext}
          aria-label="Next place"
          className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-daet-ink transition hover:bg-muted-strong"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </section>
  );
}
