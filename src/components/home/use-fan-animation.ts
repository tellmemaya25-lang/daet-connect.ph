"use client";

import { useCallback, useRef } from "react";
import type { RefObject } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import {
  fanWidths,
  fanWedgePoints,
  lerpPoints,
  midVector,
  rectPolygon,
  restWidths,
  toClipPath,
  widthsWithFocus,
  type FanGeometry,
  type Point,
} from "./fan-geometry";

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

/** The numbers the fan's motion moves. Shapes are computed from them. */
type Live = {
  /** One angular width per wedge, in degrees. */
  widths: number[];
  /** How far each wedge has grown towards the whole hero, 0 to 1. */
  open: number[];
};

/**
 * All of the fan's motion, in one place.
 *
 * GSAP only ever tweens numbers here: the widths above, and how far each wedge
 * has opened. `render()` turns those numbers into nine-point polygons and
 * writes the `clip-path` itself. That is deliberate — GSAP's CSS plugin reads
 * the numbers inside a `clip-path` string as CSS lengths and blends anything
 * past ±100% into the wrong place, which tears the fan apart mid-hover.
 *
 * Only `clip-path`, transforms, opacity and `filter: brightness()` are
 * animated, never layout, so every frame stays on the compositor. The
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

  // The callbacks below outlive a resize: GSAP keeps the `onUpdate` it was
  // handed, so they read the geometry through a ref rather than closing over it.
  const current = useRef(geometry);
  current.current = geometry;

  const live = useRef<Live>({
    widths: restWidths(geometry),
    open: geometry.wedges.map(() => 0),
  });

  const parts = useCallback(() => {
    const element = root.current;
    if (!element) return { wedges: [] as HTMLElement[], photos: [] as HTMLElement[], chips: [] as HTMLElement[] };

    return {
      wedges: gsap.utils.toArray<HTMLElement>("[data-wedge]", element),
      photos: gsap.utils.toArray<HTMLElement>("[data-photo]", element),
      chips: gsap.utils.toArray<HTMLElement>("[data-chip]", element),
    };
  }, [root]);

  /**
   * Write every wedge's `clip-path` from the current numbers. The only place a
   * shape string is made, and the only thing an in-flight tween calls.
   */
  const render = useCallback(() => {
    const element = root.current;
    const geo = current.current;
    if (!element || !geo.width || !geo.height) return;

    const wedges = gsap.utils.toArray<HTMLElement>("[data-wedge]", element);
    if (wedges.length === 0) return;

    const state = live.current;
    const whole = rectPolygon(geo.width, geo.height);

    geo.fans.forEach((fan, fanIndex) => {
      const widths = state.widths.slice(fan.from, fan.from + fan.count);
      const shapes = fanWedgePoints(
        geo,
        fanIndex,
        widths.length === fan.count ? widths : fanWidths(fan.count, fan.a1 - fan.a0, null),
      );

      shapes.forEach((shape, offset) => {
        const index = fan.from + offset;
        const wedge = wedges[index];
        if (!wedge) return;

        const opened = state.open[index] ?? 0;
        const points: Point[] = opened > 0 ? lerpPoints(shape, whole, opened) : shape;
        wedge.style.clipPath = toClipPath(points, geo.width, geo.height);
      });
    });
  }, [root]);

  /** Put everything back the way the server rendered it. */
  const reset = useCallback(() => {
    const { wedges, photos, chips } = parts();
    const geo = current.current;
    const state = live.current;

    gsap.killTweensOf(state.widths);
    gsap.killTweensOf(state.open);

    state.widths = restWidths(geo);
    state.open = geo.wedges.map(() => 0);
    render();

    if (wedges.length === 0) return;

    wedges.forEach((element) => {
      gsap.set(element, { autoAlpha: 1, x: 0, y: 0, zIndex: 0, filter: "brightness(1)" });
    });
    photos.forEach((element) => gsap.set(element, { x: 0, y: 0, scale: 1.15 }));

    // One owner for the name tags (GSAP, not CSS): a phone shows all of them,
    // a desktop shows none until a pointer or focus arrives.
    chips.forEach((element) => {
      gsap.set(element, { y: 0, autoAlpha: geo.layout === "phone" ? 1 : 0 });
    });

    // Opacity, not autoAlpha: the headline must stay in the accessibility tree
    // even while it is faded out behind an open place. Its buttons are taken out
    // of the tab order by the component instead.
    const headline = root.current?.querySelector("[data-headline]");
    if (headline) gsap.set(headline, { opacity: 1 });
  }, [parts, render, root]);

  // The geometry changes when the hero is re-measured: rebuild the shapes from
  // whatever the motion was in the middle of, rather than snapping it back.
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
    { scope: root, dependencies: [geometry] },
  );

  /** Hovering one wedge widens it and dims the others; null restores the fan. */
  const hover = contextSafe((index: number | null) => {
    const { wedges, photos, chips } = parts();
    if (wedges.length === 0) return;

    const geo = current.current;

    if (reduced.current) {
      // No width, no scale, no drift: the name simply appears, and the dimming
      // is instant rather than eased.
      gsap.to(wedges, {
        filter: index === null ? "brightness(1)" : (i: number) => (i === index ? "brightness(1)" : "brightness(0.78)"),
        duration: REDUCED_FADE,
        ease: "none",
        overwrite: "auto",
      });
      chips.forEach((element, i) => gsap.set(element, { autoAlpha: i === index ? 1 : 0 }));
      return;
    }

    gsap.to(live.current.widths, {
      endArray: widthsWithFocus(geo, index),
      duration: HOVER,
      ease: "power3.out",
      overwrite: true,
      onUpdate: render,
    });

    gsap.to(wedges, {
      filter: index === null ? "brightness(1)" : (i: number) => (i === index ? "brightness(1)" : "brightness(0.78)"),
      duration: HOVER,
      ease: "power3.out",
      overwrite: "auto",
    });

    photos.forEach((element, i) => {
      gsap.to(element, { scale: index === i ? 1.2 : 1.15, duration: HOVER, ease: "power3.out", overwrite: "auto" });
    });

    chips.forEach((element, i) => {
      gsap.to(element, {
        autoAlpha: index === i ? 1 : 0,
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

    const state = live.current;
    const headline = root.current?.querySelector("[data-headline]");

    /** Stop the shapes where they are and put the requested wedge on top. */
    const settle = () => {
      gsap.killTweensOf(state.open);
      state.open = state.open.map((_, i) => (i === index ? 1 : 0));
      render();
      gsap.set(wedges, {
        autoAlpha: (i: number) => (i === index ? 1 : 0),
        x: 0,
        y: 0,
        zIndex: (i: number) => (i === index ? 5 : 0),
      });
      gsap.set(wedges[index], { filter: "brightness(1)" });
      gsap.set(photos[index], { x: 0, y: 0, scale: 1 });
      if (headline) gsap.set(headline, { opacity: 0 });
    };

    if (instant || reduced.current) {
      settle();
      if (!instant) gsap.to(wedges, { autoAlpha: (i: number) => (i === index ? 1 : 0), duration: REDUCED_FADE });
      onOpened?.();
      return;
    }

    const slides = wedges.map((_, i) => {
      const [ux, uy] = midVector(current.current.wedges[i]?.mid ?? 270);
      return { x: ux * SLIDE, y: uy * SLIDE };
    });

    const tl = gsap.timeline({ defaults: { ease: "power3.inOut" } });
    timeline.current = tl;

    tl.set(wedges[index], { zIndex: 5 });

    // Numbers, not shapes: the wedge grows out of its slice towards the box.
    const opening = { t: state.open[index] ?? 0 };
    tl.to(
      opening,
      {
        t: 1,
        duration: OPEN,
        onUpdate: () => {
          state.open[index] = opening.t;
          render();
        },
      },
      0,
    );

    tl.to(wedges[index], { filter: "brightness(1)", duration: OPEN }, 0);
    tl.to(photos[index], { x: 0, y: 0, scale: 1, duration: OPEN }, 0);

    wedges.forEach((element, i) => {
      if (i === index) return;
      tl.to(element, { autoAlpha: 0, x: slides[i].x, y: slides[i].y, duration: OPEN }, 0);
    });

    if (headline) tl.to(headline, { opacity: 0, duration: 0.25, ease: "power2.out" }, 0);
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

    const state = live.current;
    gsap.killTweensOf(state.open);
    state.open = state.open.map((_, i) => (i === index ? 1 : 0));
    render();

    wedges.forEach((element, i) => {
      if (i === index) return;
      gsap.to(element, { autoAlpha: 0, duration: SWAP, ease: "power2.inOut", overwrite: "auto" });
    });

    gsap.set(wedges[index], { zIndex: 5, filter: "brightness(1)" });
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
