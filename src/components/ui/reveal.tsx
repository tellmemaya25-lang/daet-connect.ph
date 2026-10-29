"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Section entrances. Elements marked data-reveal rise into place once as they
 * scroll into view, staggered by --reveal-index. Content is visible until this
 * script marks the page ready, so nothing stays hidden if it fails; reduced
 * motion turns the travel off in globals.css.
 */
export function RevealObserver() {
  const pathname = usePathname();
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const root = document.documentElement;
    const items = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-revealed)"));
    // Anything already on screen shows at once, without a flash.
    const viewport = window.innerHeight;
    for (const el of items) if (el.getBoundingClientRect().top < viewport * 0.9) el.classList.add("is-revealed");
    root.classList.add("reveal-ready");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    for (const el of items) if (!el.classList.contains("is-revealed")) observer.observe(el);
    return () => observer.disconnect();
  }, [pathname]);
  return null;
}
