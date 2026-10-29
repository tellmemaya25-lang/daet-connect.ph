"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { LineIcon } from "@/components/ui/icons";
import { formatPeso } from "@/lib/money";
import { PHOTOS, type PhotoKey } from "@/lib/photo-credits";
import { shortDay, TRIP_LENGTHS, type TripLength } from "@/lib/tours/trip-board";

export type BoardTrip = {
  id: string;
  title: string;
  location: string;
  length: TripLength;
  duration: string;
  price: number | null;
  perPerson: boolean;
  nextDate: string | null;
  photo: PhotoKey;
};

/** What each length means in Daet, for when no published trip fits yet. */
const PLACES: Record<TripLength, { place: string; travel: string; text: string; photo: PhotoKey; location: string }> = {
  half: {
    place: "Bagasbas and Daet town",
    travel: "No boat · ten minutes from the plaza",
    text: "A morning in the surf or a walk through the old town, back in time for lunch.",
    photo: "bagasbas",
    location: "Bagasbas",
  },
  day: {
    place: "The Mercedes islands",
    travel: "About an hour by boat from Mercedes port",
    text: "Apuao's sandbar at low tide, the Parola lighthouse, lunch on the sand, back before the afternoon wind.",
    photo: "apuao",
    location: "Mercedes",
  },
  two: {
    place: "Calaguas",
    travel: "Boat from Paracale or Vinzons, weather permitting",
    text: "Boat out in the morning, a night on the white sand, a sunrise swim, and back the next day.",
    photo: "calaguasCove",
    location: "Calaguas",
  },
};

/**
 * "How long have you got?" Choose a length and see the real published trips
 * that fit, like a departure board: where, how long, the next open date and
 * the price. Without script, every trip is listed under the first choice's
 * picture, so nothing is hidden.
 */
export function TripLengthPicker({ trips }: { trips: BoardTrip[] }) {
  const firstWithTrips = TRIP_LENGTHS.find((l) => trips.some((t) => t.length === l.id))?.id ?? "half";
  const [selected, setSelected] = useState<TripLength>(firstWithTrips);
  const matching = trips.filter((t) => t.length === selected);
  const place = PLACES[selected];
  const photo = PHOTOS[matching[0]?.photo ?? place.photo];

  return (
    <div>
      <div role="group" aria-label="Trip length" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {TRIP_LENGTHS.map((item) => {
          const on = item.id === selected;
          const count = trips.filter((t) => t.length === item.id).length;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={on}
              onClick={() => setSelected(item.id)}
              className={`inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full px-5 text-base font-bold transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                on ? "bg-blue-600 text-white" : "bg-white text-daet-ink hover:bg-blue-50"
              }`}
            >
              {item.label}
              <span className={`rounded-full px-2 text-sm ${on ? "bg-white/20" : "bg-slate-100"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:gap-10">
        <figure className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-blue-100 lg:aspect-auto lg:min-h-[480px]">
          <Image key={photo.src} src={photo.src} alt={photo.alt} fill sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover" />
          <figcaption className="absolute inset-x-3 bottom-3 rounded-2xl bg-slate-950/80 px-4 py-3 text-white">
            <strong className="block text-lg">{place.place}</strong>
            <span className="text-sm text-slate-200">{place.travel}</span>
          </figcaption>
        </figure>

        <div aria-live="polite">
          {matching.length ? (
            <ul className="space-y-2">
              {matching.map((trip) => (
                <li key={trip.id}>
                  <Link
                    href={`/tours/packages/${trip.id}`}
                    className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 rounded-2xl bg-white p-4 transition hover:bg-blue-50 active:scale-[0.99] sm:p-5"
                  >
                    <span className="text-lg font-bold leading-snug text-daet-ink group-hover:text-blue-700 sm:text-xl">{trip.title}</span>
                    <span className="row-span-2 text-right">
                      {trip.price != null ? (
                        <>
                          <span className="block text-lg font-bold text-daet-ink">{formatPeso(trip.price)}</span>
                          <span className="block text-sm text-daet-ink/75">{trip.perPerson ? "per person" : "per group"}</span>
                        </>
                      ) : null}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-daet-ink/80">
                      <span className="inline-flex items-center gap-1">
                        <LineIcon name="pin" className="h-4 w-4" /> {trip.location}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <LineIcon name="clock" className="h-4 w-4" /> {trip.duration}
                      </span>
                      <span className="inline-flex items-center gap-1 font-semibold text-blue-700">
                        <LineIcon name="calendar" className="h-4 w-4" />
                        {trip.nextDate ? `Next: ${shortDay(trip.nextDate)}` : "Ask for dates"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl bg-white p-6 sm:p-8">
              <p className="text-xl font-bold text-daet-ink">No {TRIP_LENGTHS.find((l) => l.id === selected)?.label.toLowerCase()} trips are listed yet.</p>
              <p className="mt-2 text-daet-ink">{place.text}</p>
            </div>
          )}
          <Link
            href={`/tours/browse?location=${encodeURIComponent(matching[0]?.location ?? place.location)}`}
            className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-full bg-blue-600 px-6 font-bold text-white transition hover:bg-blue-700 active:scale-[0.98]"
          >
            See all trips <LineIcon name="arrowRight" className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
