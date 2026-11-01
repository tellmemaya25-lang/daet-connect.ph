"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";

/**
 * The fold: as the hero scrolls out, the fan lifts and the headline fades, so
 * the page's first heading arrives underneath it.
 *
 * The section itself never moves. Scaling it, as this used to, shrank the hero
 * into a boxed card with white margins beside and below it — and because
 * `getBoundingClientRect()` reports a transformed box, it could also make the
 * fan rebuild its shapes at the wrong size mid-scroll. Only the two layers
 * inside it scrub: the wedges' group and the headline.
 *
 * Desktop only, and never under `prefers-reduced-motion` — on a phone the hero
 * is the whole screen and the fan is the thing being tapped, so moving it while
 * a thumb is on the glass would be a nuisance. It is scrubbed rather than
 * pinned: a pinned hero that misbehaves takes the whole page with it.
 *
 * Image height changes move every trigger below them, so the triggers are
 * refreshed once the page has finished loading.
 *
 * `paused` is for an open place. That view is the hero's whole screen filled by
 * one photo, and lifting the fan by 8% uncovers a band of the hero's own ground
 * along the bottom edge — which reads as the photo not being full screen. So
 * opening a place takes the fold away entirely, and closing it puts the fold
 * back where the scroll position says it should be.
 */
export function useHeroFold(root: RefObject<HTMLElement | null>, { paused = false }: { paused?: boolean } = {}) {
  const refreshQueued = useRef(false);
  const { contextSafe } = useGSAP(
    () => {
      if (paused) return;

      const media = gsap.matchMedia();

      media.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
        const section = root.current;
        if (!section) return;

        const fan = section.querySelector("[role='group']");
        const headline = section.querySelector("[data-headline]");
        const tweens: ReturnType<typeof gsap.to>[] = [];

        if (fan) {
          tweens.push(
            gsap.to(fan, {
              yPercent: -8,
              ease: "none",
              scrollTrigger: {
                trigger: section,
                start: "top top",
                end: "bottom top",
                scrub: true,
              },
            }),
          );
        }

        if (headline) {
          // Gone by 60% of the way out, so the section below is already the
          // thing being read while the last of the fan leaves.
          tweens.push(
            gsap.to(headline, {
              opacity: 0,
              ease: "none",
              scrollTrigger: {
                trigger: section,
                start: "top top",
                end: "60% top",
                scrub: true,
              },
            }),
          );
        }

        return () => {
          tweens.forEach((tween) => {
            tween.scrollTrigger?.kill();
            tween.kill();
          });
        };
      });

      return () => media.revert();
    },
    { scope: root, dependencies: [paused] },
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
