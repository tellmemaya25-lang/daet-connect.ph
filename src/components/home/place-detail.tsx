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
 * Laid out as in the mock (image-2): a dark scrim card sitting over the bottom
 * left of the place's own photo — not a panel taking a column off the right —
 * with the ✕ over the photo's top right corner and the ‹ › pair over its bottom
 * right. A phone has no room beside the photo, so the same card stands up as a
 * sheet from the bottom, keeping the ✕ and the arrows with it.
 *
 * The card is a scrim rather than a flat surface, so its background is dark
 * whatever the theme: white text at 80% ink over any photo stays past 10:1,
 * and the ✕ and the arrows are 48px targets.
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

  /** A 48px circle over the photo: dark glass, white glyph. */
  const round = "grid h-12 w-12 place-items-center rounded-full bg-slate-950/45 text-white backdrop-blur-md transition hover:bg-slate-950/70 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white";

  const card = (
    <>
      <p className="text-sm font-medium text-white/75">
        {position} of {total}
      </p>
      <h2
        id="place-detail-title"
        ref={headingRef}
        tabIndex={-1}
        className="display-2 mt-1 text-white outline-none"
      >
        {place.name}
      </h2>
      <p className="mt-3 text-base leading-relaxed text-white/90">{place.text}</p>

      {place.tag && (
        <p className="mt-4 inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">
          {place.tag}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <ButtonLink href={place.href}>See the place</ButtonLink>
        <ButtonLink href={place.toursHref} variant="onBlue">
          Trips near here
        </ButtonLink>
      </div>
    </>
  );

  const arrows = (variant: "float" | "inline") => (
    <div className={variant === "float" ? "pointer-events-auto flex gap-3" : "mt-6 flex items-center justify-between gap-2"}>
      <button
        type="button"
        onClick={onPrev}
        aria-label="Previous place"
        className={variant === "float" ? round : "grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <button
        type="button"
        onClick={onNext}
        aria-label="Next place"
        className={variant === "float" ? round : "grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );

  return (
    <>
      {/* Over the photo's top right corner, clear of the header's own height. */}
      <div className="pointer-events-none absolute right-4 top-[calc(var(--header-h)+0.75rem)] z-30 sm:right-6 sm:top-[calc(var(--header-h)+1.5rem)]">
        <button type="button" onClick={onClose} aria-label="Close" className={`pointer-events-auto ${round}`}>
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <section
        ref={panelRef}
        data-detail
        aria-labelledby="place-detail-title"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={
          phone
            ? "pointer-events-auto absolute inset-x-0 bottom-0 z-20 max-h-[72%] overflow-y-auto overscroll-contain rounded-t-2xl bg-slate-950/85 p-5 pb-8 text-white backdrop-blur-md"
            : "pointer-events-auto absolute bottom-8 left-4 z-20 max-w-[28.5rem] rounded-2xl bg-slate-950/80 p-6 text-white sm:bottom-12 sm:left-10 sm:p-7"
        }
      >
        {phone && (
          <div aria-hidden="true" className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/30" />
        )}

        {card}

        {/* A phone keeps the pair with the card; a desktop floats them over the
            photo's bottom right corner, as in the mock. */}
        {phone && arrows("inline")}
      </section>

      {!phone && (
        <div className="absolute bottom-8 right-4 z-20 sm:bottom-12 sm:right-10">
          {arrows("float")}
        </div>
      )}
    </>
  );
}
