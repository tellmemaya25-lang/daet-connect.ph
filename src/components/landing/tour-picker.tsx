"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PackageCard, type PackageCardData } from "@/app/(subsystems)/tours/browse/package-card";
import { SPANS, filterPackages, placesOf, type Span } from "./package-filters";

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-11 shrink-0 rounded-full px-5 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
        active ? "bg-blue-600 text-white" : "bg-white text-daet-ink hover:bg-blue-50"
      }`}
    >
      {children}
    </button>
  );
}

/** "How long have you got?" and "Where?" filter the featured packages on the page; without script all of them show. */
export function TourPicker({ packages }: { packages: PackageCardData[] }) {
  const [span, setSpan] = useState<Span>("all");
  const [place, setPlace] = useState<string | null>(null);
  const places = useMemo(() => placesOf(packages), [packages]);
  const shown = filterPackages(packages, span, place);
  const rowClass = "-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0";

  return (
    <div>
      <div role="group" aria-label="How long have you got?" className={rowClass}>
        {SPANS.map((s) => (
          <Chip key={s.id} active={span === s.id} onClick={() => setSpan(s.id)}>{s.label}</Chip>
        ))}
      </div>
      {places.length > 1 ? (
        <div role="group" aria-label="Where?" className={`${rowClass} mt-2`}>
          <Chip active={place === null} onClick={() => setPlace(null)}>Anywhere</Chip>
          {places.map((name) => (
            <Chip key={name} active={place === name} onClick={() => setPlace(name)}>{name}</Chip>
          ))}
        </div>
      ) : null}

      {shown.length > 0 ? (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {shown.map((pkg, i) => (
            <li key={pkg.id} className={i === 0 ? "sm:col-span-2 lg:col-span-3" : undefined}>
              <PackageCard package={pkg} featured={i === 0} />
            </li>
          ))}
        </ul>
      ) : (
        <p role="status" className="mt-6 rounded-2xl bg-white p-6 text-daet-ink/80">
          Nothing matches that yet.{" "}
          <Link href="/tours/browse" className="font-bold text-blue-700 underline underline-offset-4">See every experience</Link>
        </p>
      )}
    </div>
  );
}
