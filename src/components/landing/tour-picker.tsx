"use client";

import { useState } from "react";
import Link from "next/link";
import { PackageCard, type PackageCardData } from "@/app/(subsystems)/tours/browse/package-card";

type Span = "all" | "hours" | "day" | "nights";

const SPANS: { id: Span; label: string }[] = [
  { id: "all", label: "Any length" },
  { id: "hours", label: "A few hours" },
  { id: "day", label: "A full day" },
  { id: "nights", label: "Overnight or more" },
];

function spanOf(pkg: PackageCardData): Exclude<Span, "all"> {
  if (pkg.duration_type === "days") return pkg.duration_value > 1 ? "nights" : "day";
  return pkg.duration_value > 5 ? "day" : "hours";
}

/** "How long have you got?" filters the featured packages on the page itself; without script all of them show. */
export function TourPicker({ packages }: { packages: PackageCardData[] }) {
  const [span, setSpan] = useState<Span>("all");
  const shown = span === "all" ? packages : packages.filter((p) => spanOf(p) === span);

  return (
    <div>
      <div role="group" aria-label="How long have you got?" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {SPANS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={span === s.id}
            onClick={() => setSpan(s.id)}
            className={`min-h-11 shrink-0 rounded-full px-5 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
              span === s.id ? "bg-blue-600 text-white" : "bg-white text-daet-ink hover:bg-blue-50"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {shown.length > 0 ? (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {shown.map((pkg, i) => (
            <li key={pkg.id} className={i === 0 ? "sm:col-span-2 lg:col-span-3" : undefined}>
              <PackageCard package={pkg} featured={i === 0} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 rounded-2xl bg-white p-6 text-daet-ink/80">
          Nothing that length yet.{" "}
          <Link href="/tours/browse" className="font-bold text-blue-700 underline underline-offset-4">See every experience</Link>
        </p>
      )}
    </div>
  );
}
