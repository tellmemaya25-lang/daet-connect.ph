"use client";

import Link from "next/link";
import { useState } from "react";
import { formatPeso } from "@/lib/money";
import type { BookablePackage } from "@/lib/tours/itinerary/data";
import { filterChoices, ratingText, STAR_CHOICES, type CompareChoice, type CompareScope, type CompareSort, type MinStars } from "@/lib/tours/itinerary/compare";

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm font-bold ${pressed ? "bg-blue-600 text-white" : "border border-slate-400 bg-surface text-daet-ink hover:bg-muted"}`}
    >
      {children}
    </button>
  );
}

/**
 * The suggested tour beside the same tour from other operators (and, if the
 * tourist widens it, tours sharing some of the places), filtered by star
 * rating and sorted by price or rating, so they can pick who to book with.
 */
export function CompareChoices({ pkg, group, bookHref: href, canBook }: { pkg: BookablePackage; group: number | null; bookHref?: string; canBook: boolean }) {
  const alternatives = pkg.alternatives ?? [];
  const sameCount = alternatives.filter((a) => a.sameOffer).length;
  const [scope, setScope] = useState<CompareScope>(sameCount ? "same" : "all");
  const [minStars, setMinStars] = useState<MinStars>(0);
  const [sort, setSort] = useState<CompareSort>("price");

  const choices: Array<CompareChoice & { duration?: string | null; verified: boolean; shared?: string[] }> = [
    { id: pkg.id, title: pkg.title, price: pkg.price, operatorName: pkg.operatorName, rating: pkg.rating, duration: pkg.duration, verified: pkg.verified, suggested: true },
    ...alternatives,
  ];
  const details = new Map(choices.map((c) => [c.id, c]));
  const { shown, hiddenUnrated } = filterChoices(choices, { scope, minStars, sort });
  const summary = sameCount
    ? `Compare ${sameCount + 1} operators offering this tour`
    : `${alternatives.length} similar ${alternatives.length === 1 ? "tour" : "tours"} for the same places`;

  return (
    <details className="group/similar rounded-xl bg-surface p-3">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold text-blue-700 dark:text-blue-300">
        <span>{summary}</span>
        <span aria-hidden="true" className="transition-transform group-open/similar:rotate-180">⌄</span>
      </summary>

      <div className="mt-2 space-y-2">
        {sameCount && alternatives.length > sameCount ? (
          <div role="group" aria-label="Which tours" className="flex flex-wrap gap-2">
            <Chip pressed={scope === "same"} onClick={() => setScope("same")}>Same tour</Chip>
            <Chip pressed={scope === "all"} onClick={() => setScope("all")}>Similar tours too</Chip>
          </div>
        ) : null}
        <div role="group" aria-label="Rating" className="flex flex-wrap gap-2">
          {STAR_CHOICES.map((s) => (
            <Chip key={s.value} pressed={minStars === s.value} onClick={() => setMinStars(s.value)}>
              {s.label}
            </Chip>
          ))}
        </div>
        <div role="group" aria-label="Sort by" className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600 dark:text-slate-400">Sort by</span>
          <Chip pressed={sort === "price"} onClick={() => setSort("price")}>Lowest price</Chip>
          <Chip pressed={sort === "rating"} onClick={() => setSort("rating")}>Highest rated</Chip>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {shown.length} {shown.length === 1 ? "tour" : "tours"} shown
      </p>
      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">No tours here have that rating yet. Pick a lower rating to see them all.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {shown.map((c) => {
            const d = details.get(c.id)!;
            const price = c.price
              ? c.price.perPerson
                ? `from ${formatPeso(c.price.amount)} per person${group && group > 1 ? ` · about ${formatPeso(c.price.amount * group)} for ${group}` : ""}`
                : `from ${formatPeso(c.price.amount)} per group`
              : "Price on the tour page";
            // Same day and group as the suggested tour's booking link, for this tour instead.
            const altHref = href && !c.suggested ? href.replace(`/packages/${pkg.id}/`, `/packages/${c.id}/`) : null;
            return (
              <li key={c.id} className={`space-y-1 rounded-lg border p-3 ${c.suggested ? "border-blue-500" : "border-daet-ink/10"}`}>
                <p className="font-bold text-daet-ink">
                  {c.operatorName ?? c.title}
                  {c.suggested ? <span className="ml-2 rounded-full bg-blue-100 px-2 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200">Suggested</span> : null}
                </p>
                {c.operatorName ? <p className="text-sm text-daet-ink">{c.title}</p> : null}
                <p className="text-sm text-slate-600 dark:text-slate-400">{[d.duration, price].filter(Boolean).join(" · ")}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {ratingText(c.rating)}
                  {d.verified ? " · Verified by the Tourism Office" : ""}
                </p>
                {!c.suggested && !c.sameOffer && d.shared?.length ? <p className="text-xs text-slate-600 dark:text-slate-400">Also visits {d.shared.join(", ")}</p> : null}
                {!c.suggested ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {altHref && canBook ? (
                      <Link href={altHref} className="inline-flex min-h-11 items-center rounded-full bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">
                        Book this instead
                      </Link>
                    ) : null}
                    <Link href={`/tours/packages/${c.id}`} className="inline-flex min-h-11 items-center rounded-full border border-slate-500 bg-surface px-4 text-sm font-bold text-daet-ink hover:bg-muted">
                      See details
                    </Link>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {hiddenUnrated ? (
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
          {hiddenUnrated} {hiddenUnrated === 1 ? "tour has" : "tours have"} no reviews yet and {hiddenUnrated === 1 ? "is" : "are"} hidden by this rating.
        </p>
      ) : null}
    </details>
  );
}
