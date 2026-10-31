"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { CategoryIcon, LineIcon } from "@/components/ui/icons";

export type PlacePanel = {
  name: string;
  text: string;
  /** An attraction category (beach, heritage, religious…) or "boat". */
  icon: string;
  href: string;
  cta: string;
  photo: { src: string; alt: string };
};

/**
 * A row of photo panels where one is open at a time. The open panel is wide and
 * in colour with its name, a line about the place and a link; the rest are
 * narrow, grey and show only their name. Pointing (mouse), tapping or focusing
 * a panel opens it. On phones the row becomes a stack of strips.
 */
export function PlacePanels({ panels }: { panels: PlacePanel[] }) {
  const [active, setActive] = useState(0);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const baseId = useId();

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    const jump = event.key === "Home" ? 0 : event.key === "End" ? panels.length - 1 : null;
    if (step === undefined && jump === null) return;
    event.preventDefault();
    const next = jump ?? (index + step! + panels.length) % panels.length;
    buttons.current[next]?.focus();
  };

  return (
    <ul className="flex flex-col gap-2 md:h-[26rem] md:flex-row md:gap-3 lg:h-[30rem]">
      {panels.map((panel, index) => {
        const open = index === active;
        const buttonId = `${baseId}-button-${index}`;
        const regionId = `${baseId}-region-${index}`;
        return (
          <li
            key={panel.name}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") setActive(index);
            }}
            className={`relative overflow-hidden rounded-2xl bg-blue-950 transition-[height,flex-grow] duration-500 ease-out md:h-auto md:min-w-0 md:basis-0 ${
              open ? "h-80 md:grow-[5]" : "h-16 md:grow"
            }`}
          >
            <Image
              src={panel.photo.src}
              alt={panel.photo.alt}
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className={`object-cover transition-[filter] duration-500 ${open ? "" : "brightness-75 grayscale"}`}
            />
            <div
              aria-hidden="true"
              className={`absolute inset-0 transition-opacity duration-500 ${
                open ? "bg-gradient-to-t from-slate-950/85 via-slate-950/30 to-transparent" : "bg-slate-950/45"
              }`}
            />
            <h3 className="contents">
              <button
                ref={(node) => {
                  buttons.current[index] = node;
                }}
                id={buttonId}
                type="button"
                aria-expanded={open}
                aria-controls={regionId}
                onClick={() => setActive(index)}
                onFocus={() => setActive(index)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className="absolute inset-0 flex items-center rounded-2xl px-4 text-left text-white focus-visible:outline-3 focus-visible:-outline-offset-4 focus-visible:outline-white md:items-start md:justify-center md:px-0 md:pt-5"
              >
                <span
                  className={`font-bold leading-tight drop-shadow-sm transition-opacity duration-300 md:[writing-mode:vertical-rl] md:rotate-180 ${
                    open ? "sr-only" : "text-base"
                  }`}
                >
                  {panel.name}
                </span>
              </button>
            </h3>
            <div
              id={regionId}
              role="region"
              aria-labelledby={buttonId}
              inert={!open}
              className={`pointer-events-none absolute inset-x-0 bottom-0 p-5 text-white transition-opacity sm:p-6 ${
                open ? "opacity-100 delay-200 duration-300" : "opacity-0 duration-150"
              }`}
            >
              {/* Fixed width from md up, so the text doesn't re-wrap while the panel widens. */}
              <div className="md:w-[16.5rem] lg:w-[22rem]">
                <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/40">
                  {panel.icon === "boat" ? <LineIcon name="boat" className="h-5 w-5" /> : <CategoryIcon category={panel.icon} className="h-5 w-5" />}
                </span>
                <p aria-hidden="true" className="font-[family-name:var(--font-display)] text-2xl font-bold leading-tight sm:text-3xl">
                  {panel.name}
                </p>
                <p className="mt-2 text-base leading-relaxed text-white/90">{panel.text}</p>
                <Link
                  href={panel.href}
                  data-theme="light" className="pointer-events-auto mt-4 inline-flex min-h-11 items-center gap-1 rounded-full bg-white px-4 font-bold text-blue-800 hover:bg-blue-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {panel.cta} <LineIcon name="arrowRight" className="h-5 w-5" />
                </Link>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
