"use client";

import React, { useRef } from "react";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import type { FanPlace } from "./fan-places";

/** A downward drag longer than this dismisses the phone sheet. */
const DISMISS_AFTER = 80;

/**
 * What opens over the fan: the place's name, where it sits in the six, what it
 * is, and the two things a visitor can do next.
 *
 * Laid out as in the mock (image-2): a dark scrim card over the place's own
 * photo — not a panel taking a column off the right — with the ✕ in the photo's
 * top right corner and the ‹ › pair along its bottom right. The card, the ✕ and
 * the arrows all hang off the same 7xl column the rest of the page is set in, so
 * on a wide screen the card sits with the page's text rather than floating in
 * the screen's corner. A phone has no room beside the photo, so the same card
 * stands up as a sheet from the bottom, keeping the arrows with it.
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

  /**
   * "Open on the map" scrolls to the map further down the page, where the pins
   * open a place in this same fan. It leaves the hash alone on purpose: the hash
   * is what holds this card open, so changing it would close the place the
   * visitor is looking at on their way there.
   */
  const onOpenMap = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const map = document.getElementById("home-map");
    if (!map) return;
    event.preventDefault();
    map.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
        {/* A plain anchor, so it still works with the script off; the handler
            scrolls without changing the hash, which would close the place the
            visitor is standing on. */}
        <a href="#home-map" onClick={onOpenMap} className={buttonClasses()}>
          Open on the map
        </a>
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

  /**
   * The page's own column. The card, the ✕ and the arrows hang off this, so on a
   * wide screen they line up with the sections below instead of drifting out to
   * the screen's corners.
   */
  const COLUMN = "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8";

  const closeButton = (
    <div className="pointer-events-none absolute inset-x-0 top-[calc(var(--header-h)+0.75rem)] z-30 sm:top-[calc(var(--header-h)+1.5rem)]">
      <div className={`${COLUMN} flex justify-end`}>
        <button type="button" onClick={onClose} aria-label="Close" className={`pointer-events-auto ${round}`}>
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );

  const panel = (
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
          : "pointer-events-auto w-full max-w-[28.5rem] rounded-2xl bg-slate-950/80 p-6 text-white sm:p-7"
      }
    >
      {phone && <div aria-hidden="true" className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/30" />}

      {card}

      {/* A phone keeps the arrows with the card; a desktop floats them over the
          photo's bottom right corner, as in the mock. */}
      {phone && arrows("inline")}
    </section>
  );

  if (phone) {
    return (
      <>
        {closeButton}
        {panel}
      </>
    );
  }

  return (
    <>
      {closeButton}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
        <div className={`${COLUMN} flex items-end justify-between gap-4 pb-8 sm:pb-12`}>
          {panel}
          <div className="shrink-0">{arrows("float")}</div>
        </div>
      </div>
    </>
  );
}
