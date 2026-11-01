"use client";

import { useCallback, useRef } from "react";
import type { RefObject } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { midVector, type FanGeometry } from "./fan-geometry";

/** Timings from the mock-up's Motion spec board. */
const HOVER = 0.35;
const CHIP = 0.2;
const OPEN = 0.45;
const SWAP = 0.3;
const PARALLAX = 0.6;
const REDUCED_FADE = 0.15;

/** How far the other wedges slide outward as one opens, in px. */
const SLIDE = 60;

type Timeline = ReturnType<typeof gsap.timeline>;

/**
 * All of the fan's motion, in one place.
 *
 * Only `clip-path`, transforms, opacity and `filter: brightness()` are
 * animated — never layout — so every frame stays on the compositor. The
 * reduced-motion branch drops the shape morphs entirely and cross-fades
 * instead, and nothing here explains a change by motion alone: the counter,
 * the focus move and the live region carry the meaning.
 */
export function useFanAnimation({
  root,
  geometry,
  onOpened,
  onClosed,
}: {
  root: RefObject<HTMLElement | null>;
  geometry: FanGeometry;
  onOpened?: () => void;
  onClosed?: () => void;
}) {
  const timeline = useRef<Timeline | null>(null);
  const reduced = useRef(false);
  const parallaxTweens = useRef(new Map<number, (value: number) => void>());

  const parts = useCallback(() => {
    const element = root.current;
    if (!element) return { wedges: [] as HTMLElement[], photos: [] as HTMLElement[], chips: [] as HTMLElement[] };

    return {
      wedges: gsap.utils.toArray<HTMLElement>("[data-wedge]", element),
      photos: gsap.utils.toArray<HTMLElement>("[data-photo]", element),
      chips: gsap.utils.toArray<HTMLElement>("[data-chip]", element),
    };
  }, [root]);

  /** Put everything back the way the server rendered it. */
  const reset = useCallback(() => {
    const { wedges, photos, chips } = parts();
    if (wedges.length === 0) return;

    wedges.forEach((element, index) => {
      gsap.set(element, {
        clipPath: geometry.wedges[index]?.rest ?? "none",
        autoAlpha: 1,
        x: 0,
        y: 0,
        zIndex: 0,
        filter: "brightness(1)",
      });
    });
    photos.forEach((element) => gsap.set(element, { x: 0, y: 0, scale: 1.15 }));
    chips.forEach((element) => gsap.set(element, { y: 0 }));
  }, [geometry, parts]);

  // The geometry changes when the hero is re-measured: re-apply the rest shapes.
  const { contextSafe } = useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        { desktop: "(min-width: 768px)", phone: "(max-width: 767px)", reduce: "(prefers-reduced-motion: reduce)" },
        (context) => {
          reduced.current = Boolean(context.conditions?.reduce);
          reset();
        },
      );
    },
    { scope: root, dependencies: [geometry], revertOnUpdate: true },
  );

  /** Hovering one wedge widens it and dims the others; null restores the fan. */
  const hover = contextSafe((index: number | null) => {
    const { wedges, photos, chips } = parts();
    if (wedges.length === 0) return;

    if (reduced.current) {
      gsap.to(wedges, {
        filter: index === null ? "brightness(1)" : (i: number) => (i === index ? "brightness(1)" : "brightness(0.78)"),
        duration: HOVER,
        ease: "power3.out",
        overwrite: "auto",
      });
      return;
    }

    wedges.forEach((element, i) => {
      gsap.to(element, {
        clipPath: index === null ? geometry.wedges[i].rest : geometry.wedges[i].focusVariants[index],
        filter: index === null || index === i ? "brightness(1)" : "brightness(0.78)",
        duration: HOVER,
        ease: "power3.out",
        overwrite: "auto",
      });
    });

    photos.forEach((element, i) => {
      gsap.to(element, { scale: index === i ? 1.2 : 1.15, duration: HOVER, ease: "power3.out", overwrite: "auto" });
    });

    chips.forEach((element, i) => {
      gsap.to(element, {
        autoAlpha: index === i ? 1 : index === null ? undefined : 0,
        y: index === i ? 0 : 6,
        duration: CHIP,
        ease: "power3.out",
        overwrite: "auto",
      });
    });
  });

  /** Growing one wedge to fill the hero. `instant` is for a URL that names a place. */
  const openAt = contextSafe((index: number, { instant = false }: { instant?: boolean } = {}) => {
    const { wedges, photos } = parts();
    if (wedges.length === 0) {
      onOpened?.();
      return;
    }

    timeline.current?.kill();
    timeline.current = null;

    if (instant || reduced.current) {
      gsap.set(wedges, { autoAlpha: (i: number) => (i === index ? 1 : 0), x: 0, y: 0, zIndex: (i: number) => (i === index ? 5 : 0) });
      gsap.set(wedges[index], { clipPath: geometry.open, filter: "brightness(1)" });
      gsap.set(photos[index], { x: 0, y: 0, scale: 1 });
      if (!instant) gsap.to(wedges, { autoAlpha: (i: number) => (i === index ? 1 : 0), duration: REDUCED_FADE });
      onOpened?.();
      return;
    }

    const headline = root.current?.querySelector("[data-headline]");
    const slides = wedges.map((_, i) => {
      const [ux, uy] = midVector(geometry.wedges[i].mid);
      return { x: ux * SLIDE, y: uy * SLIDE };
    });

    const tl = gsap.timeline({ defaults: { ease: "power3.inOut" } });
    timeline.current = tl;

    tl.set(wedges[index], { zIndex: 5 });
    tl.to(wedges[index], { clipPath: geometry.open, filter: "brightness(1)", duration: OPEN }, 0);
    tl.to(photos[index], { x: 0, y: 0, scale: 1, duration: OPEN }, 0);

    wedges.forEach((element, i) => {
      if (i === index) return;
      tl.to(element, { autoAlpha: 0, x: slides[i].x, y: slides[i].y, duration: OPEN }, 0);
    });

    if (headline) tl.to(headline, { autoAlpha: 0, duration: 0.25, ease: "power2.out" }, 0);
    tl.eventCallback("onComplete", () => onOpened?.());
  });

  /** Folding back. Reversing the open timeline gives the mock-up's close. */
  const close = contextSafe(() => {
    const tl = timeline.current;
    if (!tl) {
      reset();
      onClosed?.();
      return;
    }

    tl.eventCallback("onReverseComplete", () => {
      timeline.current = null;
      reset();
      onClosed?.();
    });
    tl.reverse();
  });

  /** Next or previous while open: cross-fade, no folding back first. */
  const swapTo = contextSafe((index: number) => {
    const { wedges, photos } = parts();
    if (wedges.length === 0) return;

    timeline.current?.kill();
    timeline.current = null;

    wedges.forEach((element, i) => {
      if (i === index) return;
      gsap.to(element, { autoAlpha: 0, duration: SWAP, ease: "power2.inOut", overwrite: "auto" });
    });

    gsap.set(wedges[index], { clipPath: geometry.open, zIndex: 5, filter: "brightness(1)" });
    gsap.to(wedges[index], { autoAlpha: 1, duration: SWAP, ease: "power2.inOut", overwrite: "auto" });
    gsap.to(photos[index], { x: 0, y: 0, scale: 1, duration: SWAP, ease: "power2.inOut" });
  });

  /** A small nudge of the photo toward the pointer, ±1% of the hero width. */
  const parallax = contextSafe((index: number, offsetX: number) => {
    if (reduced.current) return;
    const { photos } = parts();
    if (!photos[index]) return;

    let tween = parallaxTweens.current.get(index);
    if (!tween) {
      tween = gsap.quickTo(photos[index], "x", { duration: PARALLAX, ease: "power2.out" });
      parallaxTweens.current.set(index, tween);
    }
    tween(offsetX);
  });

  return { hover, openAt, close, swapTo, parallax, reset };
}
