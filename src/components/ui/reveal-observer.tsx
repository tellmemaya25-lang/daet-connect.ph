"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Anything still waiting to be revealed. */
const WAITING = "[data-reveal]:not([data-revealed])";

/**
 * The one-time section reveal.
 *
 * Sections marked `data-reveal` used to be animated by a scroll-linked CSS
 * animation (`animation-timeline: view()`), which ties opacity to how far the
 * element is into the viewport: whatever was part-way in stayed part-way
 * transparent, which read as a half-faded ghost and failed contrast. This marks
 * an element once, when it first arrives, and then stops watching it — so a
 * section is either on its way in or done, never parked in between.
 *
 * Without JavaScript nothing is hidden in the first place: the rules in
 * globals.css only apply under `html.js`.
 */
export function RevealObserver() {
  // Pages are client-navigated too, and a new page's sections are new elements.
  const pathname = usePathname();

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(WAITING));
    if (elements.length === 0) return;

    const reveal = (element: Element) => element.setAttribute("data-revealed", "");

    if (typeof IntersectionObserver === "undefined") {
      elements.forEach(reveal);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          reveal(entry.target);
          observer.unobserve(entry.target);
        });
      },
      // A little inside the bottom edge, so a section is already moving by the
      // time its first line is comfortably in view.
      { rootMargin: "0px 0px -10% 0px", threshold: 0 },
    );

    elements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
