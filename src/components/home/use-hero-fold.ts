"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";

/**
 * The fold: as the hero scrolls out, it shrinks and lifts a little, so the fan
 * reads as folding away and the page's first heading arrives underneath it.
 *
 * Desktop only, and never under `prefers-reduced-motion` — on a phone the hero
 * is the whole screen and the fan is the thing being tapped, so moving it while
 * a thumb is on the glass would be a nuisance. It is scrubbed rather than
 * pinned: nothing here can be checked in a browser yet, and a pinned hero that
 * misbehaves takes the whole page with it.
 *
 * Image height changes move every trigger below them, so the triggers are
 * refreshed once the page has finished loading.
 */
export function useHeroFold(root: RefObject<HTMLElement | null>) {
  const refreshQueued = useRef(false);
  const { contextSafe } = useGSAP(
    () => {
      const media = gsap.matchMedia();

      media.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
        const section = root.current;
        if (!section) return;

        const fold = gsap.to(section, {
          scale: 0.92,
          y: -24,
          transformOrigin: "50% 30%",
          ease: "none",
          scrollTrigger: {
            trigger: section,
            start: "top top",
            end: "bottom top",
            scrub: true,
          },
        });

        return () => {
          fold.scrollTrigger?.kill();
          fold.kill();
        };
      });

      return () => media.revert();
    },
    { scope: root },
  );

  // Photos land after the first paint and change the height of everything below.
  const refresh = contextSafe(() => {
    if (refreshQueued.current) return;
    refreshQueued.current = true;
    requestAnimationFrame(() => {
      refreshQueued.current = false;
      ScrollTrigger.refresh();
    });
  });

  useEffect(() => {
    refresh();
    window.addEventListener("load", refresh);
    return () => window.removeEventListener("load", refresh);
  }, [refresh]);
}
