"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { PHOTOS, type PhotoKey } from "@/lib/photo-credits";

type Option = {
  id: string;
  label: string;
  place: string;
  travel: string;
  title: string;
  text: string;
  photo: PhotoKey;
  /** Passed to the browse page's location filter. */
  location: string;
};

const OPTIONS: Option[] = [
  {
    id: "half",
    label: "Half a day",
    place: "Bagasbas and Daet town",
    travel: "No boat · ten minutes from the plaza",
    title: "Stay on the Daet shore",
    text: "A morning in the surf or a walk through the old town, back in time for lunch.",
    photo: "church",
    location: "Bagasbas",
  },
  {
    id: "day",
    label: "A full day",
    place: "Mercedes islands",
    travel: "About an hour by boat from Mercedes port",
    title: "Hop the Mercedes islands",
    text: "Apuao's sandbar at low tide, the Parola lighthouse, lunch on the sand, and back before the afternoon wind.",
    photo: "mercedesPort",
    location: "Mercedes",
  },
  {
    id: "two",
    label: "Two days or more",
    place: "Calaguas",
    travel: "Boat from Paracale, weather permitting",
    title: "Sleep on Calaguas",
    text: "Boat out in the morning, a night on the white sand, a sunrise swim, and back the next day.",
    photo: "calaguasCove",
    location: "Calaguas",
  },
];

/** "How long have you got?" The choice swaps the place, photo and link; without script the first option shows. */
export function TripLengthPicker() {
  const [selected, setSelected] = useState(OPTIONS[0].id);
  const option = OPTIONS.find((item) => item.id === selected) ?? OPTIONS[0];
  const photo = PHOTOS[option.photo];

  return (
    <div>
      <div role="group" aria-label="Trip length" className="flex flex-wrap gap-2">
        {OPTIONS.map((item) => {
          const on = item.id === selected;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={on}
              onClick={() => setSelected(item.id)}
              className={`min-h-12 rounded-full border-2 px-5 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-daet-forest ${
                on
                  ? "border-daet-leaf bg-daet-leaf text-white"
                  : "border-daet-ink/40 bg-white text-daet-ink hover:bg-daet-sand"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <figure className="relative min-h-[320px] overflow-hidden rounded-2xl bg-daet-leaf sm:min-h-[420px]">
          <Image
            key={photo.src}
            src={photo.src}
            alt={photo.alt}
            fill
            sizes="(min-width: 1024px) 58vw, 100vw"
            className="object-cover"
          />
          <figcaption className="absolute inset-x-4 bottom-4 flex flex-wrap gap-x-4 gap-y-1 rounded-xl bg-daet-ink/80 px-4 py-3 text-sm text-white">
            <strong>{option.place}</strong>
            <span>{option.travel}</span>
          </figcaption>
        </figure>
        <div className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-card sm:p-8" aria-live="polite">
          <h3 className="font-display text-3xl leading-tight text-daet-ink">{option.title}</h3>
          <p className="text-daet-ink">{option.text}</p>
          <Link
            href={`/tours/browse?location=${encodeURIComponent(option.location)}`}
            className="mt-2 inline-flex min-h-12 items-center justify-center self-start rounded-full bg-daet-forest px-7 text-sm font-bold text-white transition hover:bg-daet-leaf focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-daet-forest"
          >
            See trips in {option.location}
          </Link>
          <p className="mt-auto text-sm text-daet-ink/70">Every operator is verified by the Daet Tourism Office.</p>
        </div>
      </div>
    </div>
  );
}
