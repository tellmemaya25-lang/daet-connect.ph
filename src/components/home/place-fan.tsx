"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ButtonLink } from "@/components/ui/button";
import { openAssistant } from "@/lib/ui-overlay";
import { DEFAULT_HERO_SIZE, fanGeometry, midVector, type FanLayout } from "./fan-geometry";
import type { FanPlace } from "./fan-places";

/**
 * The place fan: six photos of Daet cut into wedges that radiate from a point
 * near the bottom of the hero, with the headline standing in the dark under
 * that point.
 *
 * This is the static version — every wedge is a real button with a real
 * `clip-path`, rendered on the server at the default hero size and re-measured
 * once it mounts. The hover, open and close animation is laid on top of it by
 * use-fan-animation in the next step.
 */
export function PlaceFan({ places, signedIn }: { places: FanPlace[]; signedIn: boolean }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: DEFAULT_HERO_SIZE.width,
    height: DEFAULT_HERO_SIZE.height,
  });
  const [layout, setLayout] = useState<FanLayout>("desktop");

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

  /** Rest offset for a wedge's photo: out along its mid angle, then scaled up. */
  const photoTransform = (index: number) => {
    const [ux, uy] = midVector(geometry.wedges[index].mid);
    const offset = 0.18 * Math.min(size.width, size.height);
    return `translate(${(ux * offset).toFixed(2)}px, ${(uy * offset).toFixed(2)}px) scale(1.15)`;
  };

  /** Chip position: a short way out from the apex, along the same mid angle. */
  const chipPosition = (index: number) => {
    const wedge = geometry.wedges[index];
    const [ux, uy] = midVector(wedge.mid);
    const reach = 0.3 * Math.min(size.width, size.height);
    return {
      left: `${(wedge.vp[0] + ux * reach).toFixed(1)}px`,
      top: `${(wedge.vp[1] + uy * reach).toFixed(1)}px`,
    };
  };

  const onPhone = layout === "phone";

  return (
    <section
      ref={sectionRef}
      aria-labelledby="home-title"
      className="relative h-[100svh] max-h-[1000px] min-h-[560px] w-full overflow-hidden bg-daet-ink"
    >
      <div role="group" aria-label="Places in Daet" className="absolute inset-0">
        {places.map((place, index) => (
          <button
            key={place.slug}
            type="button"
            data-wedge={index}
            aria-label={`${place.name}: open photo and details`}
            aria-expanded={false}
            style={{ clipPath: geometry.wedges[index].rest }}
            className="group absolute inset-0 m-0 block cursor-pointer border-0 bg-daet-ink p-0 text-left"
          >
            <span
              data-photo={index}
              className="absolute inset-0 block"
              style={{ transform: photoTransform(index) }}
            >
              <Image
                src={place.photo.src}
                alt={place.photo.alt}
                fill
                priority={index < 2}
                sizes="100vw"
                className="object-cover"
              />
            </span>

            {/* The chip is the wedge's label: clip-path eats outlines, so focus
                shows here instead. Always on for phones, on hover/focus for a mouse. */}
            <span
              data-chip={index}
              aria-hidden="true"
              style={chipPosition(index)}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-950/80 px-3 py-1.5 text-sm font-semibold text-white transition-opacity duration-200 group-focus-visible:ring-2 group-focus-visible:ring-blue-300 ${
                onPhone || index < 3 ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
              }`}
            >
              {onPhone ? place.shortName : place.name}
            </span>
          </button>
        ))}
      </div>

      {/* Headline: below the apex on a desktop fan, in the band between the two
          phone fans. Pointer events pass through to the wedges except on the
          buttons themselves. */}
      <div
        className="pointer-events-none absolute inset-x-0 z-10 px-4 text-center"
        style={onPhone ? { top: "49%" } : { bottom: "7%" }}
      >
        <h1 id="home-title" className={onPhone ? "display-2 text-white" : "display-1 text-white"}>
          Start in Daet.
          <span className="block">Go anywhere in Camarines Norte.</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/90 sm:text-base">
          Beaches, islands and old-town walks, with operators and guides verified by the Daet Tourism Office.
        </p>
        <div className="pointer-events-auto mt-4 flex flex-wrap justify-center gap-3">
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
      </div>
    </section>
  );
}
