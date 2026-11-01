"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ButtonLink } from "@/components/ui/button";
import { openAssistant } from "@/lib/ui-overlay";
import { DEFAULT_HERO_SIZE, fanGeometry, midVector, type FanLayout } from "./fan-geometry";
import type { FanPlace } from "./fan-places";
import { PlaceDetail } from "./place-detail";
import { useFanAnimation } from "./use-fan-animation";
import { useHeroFold } from "./use-hero-fold";
import { usePlaceHash } from "./use-place-hash";

/** A horizontal drag longer than this, on a phone, moves to the next place. */
const SWIPE_AFTER = 40;

/**
 * The place fan: six photos of Daet cut into wedges that radiate from a point
 * near the bottom of the hero, with the headline standing in the dark under
 * that point.
 *
 * Each wedge is a real button with a real `clip-path`; the URL hash is the
 * source of truth for which one is open (`#place-bagasbas-beach`), so Back
 * closes and a shared link opens straight onto a place. Motion lives in
 * use-fan-animation; the panel in PlaceDetail.
 */
export function PlaceFan({ places, signedIn }: { places: FanPlace[]; signedIn: boolean }) {
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const wedgeRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lastOpen = useRef<number | null>(null);
  // The index this component has already animated open, so a hash it set
  // itself is not opened a second time by the effect below.
  const driven = useRef<number | null>(null);
  const firstPaint = useRef(true);
  const swipeFrom = useRef<{ x: number; y: number } | null>(null);

  const [size, setSize] = useState<{ width: number; height: number }>({
    width: DEFAULT_HERO_SIZE.width,
    height: DEFAULT_HERO_SIZE.height,
  });
  const [layout, setLayout] = useState<FanLayout>("desktop");
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const element = sectionRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    let frame = 0;
    const measure = () => {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) return;

      setSize({ width: Math.round(box.width), height: Math.round(box.height) });
      // A landscape phone keeps one fan of six; anything else under 768 is two.
      const landscapePhone = box.height < 500;
      setLayout(box.width >= 768 || landscapePhone ? "desktop" : "phone");
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(element);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const geometry = useMemo(
    () => fanGeometry(size.width, size.height, layout),
    [size.width, size.height, layout],
  );

  useHeroFold(sectionRef);

  const slugs = useMemo(() => places.map((place) => place.slug), [places]);
  const { openSlug, open: openInUrl, close: closeInUrl } = usePlaceHash(slugs);

  const openIndex = openSlug ? places.findIndex((place) => place.slug === openSlug) : -1;
  const openPlace = openIndex >= 0 ? places[openIndex] : null;

  const onPhone = layout === "phone";
  // A landscape phone keeps the desktop fan but has no chips and wants its
  // place full screen, so it borrows the phone's sheet.
  const shortHero = size.height < 500;
  const sheet = onPhone || shortHero;
  const isOpen = openIndex >= 0;

  const describe = useCallback(
    (index: number) => `${places[index].name}, ${index + 1} of ${places.length}`,
    [places],
  );

  const { hover, openAt, close: closeAnimation, swapTo, parallax } = useFanAnimation({
    root: sectionRef,
    geometry,
    // Focus follows the panel in and the wedge back out, so the next Tab, arrow
    // or Escape lands where the visitor is looking.
    onOpened: () => headingRef.current?.focus(),
    onClosed: () => {
      const index = lastOpen.current;
      lastOpen.current = null;
      if (index !== null) wedgeRefs.current[index]?.focus();
    },
  });

  // The URL is the truth: a link on first load, Back and Forward, and a pin on
  // the map further down the page all arrive here. The first one opens
  // instantly, with no fold-in; the rest fold in like a click would.
  useEffect(() => {
    if (openIndex < 0) {
      driven.current = -1;
      return;
    }
    if (driven.current === openIndex) return;

    driven.current = openIndex;
    lastOpen.current = openIndex;
    setAnnouncement(describe(openIndex));
    openAt(openIndex, { instant: firstPaint.current });
  }, [openIndex, openAt, describe]);

  useEffect(() => {
    firstPaint.current = false;
  }, []);

  // Re-measuring (a rotation, a resize) rebuilds the shapes, so an open place
  // has to be put back on top of them.
  useEffect(() => {
    if (openIndex >= 0) openAt(openIndex, { instant: true });
    // Deliberately keyed on the geometry alone: openAt is re-created every render.
  }, [geometry]);

  const open = useCallback(
    (index: number) => {
      lastOpen.current = index;
      driven.current = index;
      openInUrl(places[index].slug);
      setAnnouncement(describe(index));
      hover(null);
      openAt(index);
    },
    [places, openInUrl, describe, hover, openAt],
  );

  const close = useCallback(() => {
    driven.current = -1;
    closeInUrl();
    setAnnouncement("");
    // lastOpen stays put: the fan's close animation reads it to put focus back
    // on the wedge the panel came from.
    closeAnimation();
  }, [closeInUrl, closeAnimation]);

  /** Next/previous, wrapping: the panel cross-fades rather than folding back. */
  const step = useCallback(
    (delta: number) => {
      if (openIndex < 0) return;
      const next = (openIndex + delta + places.length) % places.length;
      lastOpen.current = next;
      driven.current = next;
      openInUrl(places[next].slug);
      setAnnouncement(describe(next));
      swapTo(next);
    },
    [openIndex, places, openInUrl, describe, swapTo],
  );

  // A wheel over an open place is someone trying to leave the hero: close
  // first, then let the page scroll as it normally would.
  useEffect(() => {
    if (openIndex < 0) return;

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY > 0) close();
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    return () => window.removeEventListener("wheel", onWheel);
  }, [openIndex, close]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && openIndex >= 0) {
      event.stopPropagation();
      close();
      return;
    }

    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const delta = event.key === "ArrowRight" ? 1 : -1;

    if (openIndex >= 0) {
      event.preventDefault();
      step(delta);
      return;
    }

    // Closed: the arrows walk the fan and take focus with them.
    const current = wedgeRefs.current.findIndex((element) => element === document.activeElement);
    if (current < 0) return;
    event.preventDefault();
    const next = (current + delta + places.length) % places.length;
    wedgeRefs.current[next]?.focus();
  };

  /**
   * On a phone the open view covers the screen, so a sideways flick moves to
   * the next place. Mostly-vertical drags belong to the sheet, not to this.
   */
  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    swipeFrom.current = onPhone && openIndex >= 0 ? { x: event.clientX, y: event.clientY } : null;
  };

  const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const from = swipeFrom.current;
    swipeFrom.current = null;
    if (!from) return;

    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    if (Math.abs(dx) < SWIPE_AFTER || Math.abs(dx) < Math.abs(dy) * 1.5) return;

    step(dx < 0 ? 1 : -1);
  };

  /** Rest offset for a wedge's photo: out along its mid angle, then scaled up. */
  const photoNudge = (index: number) => {
    const [ux, uy] = midVector(geometry.wedges[index].mid);
    const offset = 0.18 * Math.min(size.width, size.height);
    return `translate(${(ux * offset).toFixed(2)}px, ${(uy * offset).toFixed(2)}px)`;
  };

  /** Chip position: a short way out from the apex, along the same mid angle. */
  const chipPosition = (index: number) => {
    const wedge = geometry.wedges[index];
    const [ux, uy] = midVector(wedge.mid);
    // The mock-up puts the phone tags 150px out from the point.
    const reach = onPhone ? 150 : 0.3 * Math.min(size.width, size.height);
    return {
      left: `${(wedge.vp[0] + ux * reach).toFixed(1)}px`,
      top: `${(wedge.vp[1] + uy * reach).toFixed(1)}px`,
    };
  };

  return (
    <section
      ref={sectionRef}
      aria-labelledby="home-title"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      style={sheet && isOpen ? { touchAction: "none" } : undefined}
      className="relative h-[100svh] max-h-[1000px] min-h-[560px] w-full overflow-hidden overscroll-contain bg-daet-ink"
    >
      <div role="group" aria-label="Places in Daet" className="absolute inset-0 z-0">
        {places.map((place, index) => (
          <button
            key={place.slug}
            ref={(element) => {
              wedgeRefs.current[index] = element;
            }}
            type="button"
            data-wedge={index}
            aria-label={`${place.name}: ${openIndex === index ? "close" : "open"} photo and details`}
            aria-expanded={openIndex === index}
            aria-controls="place-detail"
            style={{ clipPath: geometry.wedges[index].rest }}
            onClick={() => (openIndex === index ? close() : open(index))}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse" && !onPhone && openIndex < 0) hover(index);
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === "mouse" && !onPhone) hover(null);
            }}
            onPointerMove={(event) => {
              if (event.pointerType !== "mouse" || onPhone || openIndex >= 0) return;
              const box = sectionRef.current?.getBoundingClientRect();
              if (!box) return;
              parallax(index, ((event.clientX - box.left) / box.width - 0.5) * 0.02 * box.width);
            }}
            className="group absolute inset-0 m-0 block cursor-pointer border-0 bg-daet-ink p-0 text-left"
          >
            {/* Two layers: the outer one is GSAP's (scale, and the parallax
                nudge), the inner one holds the still radial offset that keeps
                each photo looking down its own wedge. */}
            <span data-photo={index} className="absolute inset-0 block" style={{ transform: "scale(1.15)" }}>
              <span className="absolute inset-0 block" style={{ transform: photoNudge(index) }}>
                <Image
                  src={place.photo.src}
                  alt={place.photo.alt}
                  fill
                  priority={index < 2}
                  sizes="100vw"
                  className="object-cover"
                />
              </span>
            </span>

            {/* The chip is the wedge's label: clip-path eats outlines, so focus
                shows here instead. Always on for phones, on hover/focus for a
                mouse, and not at all on a landscape phone. */}
            {!shortHero && (
              <span
                data-chip={index}
                aria-hidden="true"
                style={chipPosition(index)}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-950/80 px-3 py-1.5 text-sm font-semibold text-white transition-opacity duration-200 group-focus-visible:ring-2 group-focus-visible:ring-blue-300 ${
                  isOpen
                    ? "opacity-0"
                    : onPhone
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                }`}
              >
                {onPhone ? place.shortName : place.name}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Headline: below the apex on a desktop fan, in the band between the two
          phone fans. Pointer events pass through to the wedges except on the
          buttons themselves. */}
      <div
        data-headline
        className={`pointer-events-none absolute inset-x-0 z-10 px-4 text-center ${isOpen ? "opacity-0" : ""}`}
        style={onPhone ? { top: "49%" } : { bottom: "7%" }}
      >
        <h1 id="home-title" className={onPhone ? "display-2 text-white" : "display-1 text-white"}>
          Start in Daet.
          <span className="block">Go anywhere in Camarines Norte.</span>
        </h1>

        {onPhone ? (
          // The band between the two fans is only about 150px tall: the
          // headline and the hint fit, the long subline and the buttons do not.
          <p className="mt-2 text-sm text-white/80">Tap a place to see it</p>
        ) : (
          <>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/90 sm:text-base">
              Beaches, islands and old-town walks, with operators and guides verified by the Daet Tourism Office.
            </p>
            {/* Behind an open place this row is invisible, so it must not be
                tabbable either — the heading above it stays readable. */}
            <div className="pointer-events-auto mt-4 flex flex-wrap justify-center gap-3" inert={isOpen}>
              <ButtonLink href="/tours/browse" size="lg">
                Find a tour
              </ButtonLink>
              {signedIn ? (
                <ButtonLink href="/dashboard" size="lg" variant="onBlue">
                  My dashboard
                </ButtonLink>
              ) : (
                <button
                  type="button"
                  onClick={() => openAssistant()}
                  className="inline-flex min-h-12 items-center justify-center rounded-full px-7 text-base font-bold text-white ring-1 ring-inset ring-white/60 transition hover:bg-white/10 active:bg-white/20"
                >
                  Ask the travel guide
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Without JavaScript the wedges are inert, so leave a plain list of the
          same six places where the headline sits. */}
      <noscript
        dangerouslySetInnerHTML={{
          __html: `<div style="position:absolute;left:0;right:0;bottom:0;z-index:30;background:rgba(15,23,42,.95);padding:1rem;text-align:center;color:#fff;font-size:.875rem"><p style="margin:0 0 .5rem;font-weight:700">Places in Daet</p><ul style="display:flex;flex-wrap:wrap;justify-content:center;gap:.5rem 1rem;margin:0;padding:0;list-style:none">${places
            .map(
              (place) =>
                `<li><a style="color:#bfdbfe;text-decoration:underline" href="${escapeHtml(place.href)}">${escapeHtml(place.name)}</a></li>`,
            )
            .join("")}</ul></div>`,
        }}
      />

      {/* The panel's slot is always in the tree so aria-controls always resolves. */}
      <div id="place-detail" className="pointer-events-none absolute inset-0 z-20">
        {openPlace && (
          <PlaceDetail
            place={openPlace}
            index={openIndex}
            total={places.length}
            phone={sheet}
            headingRef={headingRef}
            onClose={close}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
          />
        )}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

/** The no-JS list is built as a string, so its two dynamic fields are escaped. */
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
