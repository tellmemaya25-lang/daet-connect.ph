/**
 * The planner's "Compare choices" panel: one suggested tour and the other
 * tours that visit the same places, filtered and sorted by what the tourist
 * picks. Pure, so the panel and its tests share it.
 */

export type Rating = { average: number; count: number };

export type CompareChoice = {
  id: string;
  title: string;
  price: { amount: number; perPerson: boolean } | null;
  operatorName: string | null;
  rating?: Rating | null;
  /** The same tour from another operator, not just one sharing some places. */
  sameOffer?: boolean;
  /** The tour the planner suggested. */
  suggested?: boolean;
};

/** "same": the same tour from other operators; "all": also tours sharing some of the places. */
export type CompareScope = "same" | "all";
/** 0 is any rating; 3, 4 or 4.5 keep tours rated at least that many stars. */
export type MinStars = 0 | 3 | 4 | 4.5;
export type CompareSort = "price" | "rating";

export const STAR_CHOICES: ReadonlyArray<{ value: MinStars; label: string }> = [
  { value: 0, label: "Any rating" },
  { value: 3, label: "3★ & up" },
  { value: 4, label: "4★ & up" },
  { value: 4.5, label: "4.5★ & up" },
];

const priceOf = (c: CompareChoice) => c.price?.amount ?? Infinity;
const starsOf = (c: CompareChoice) => (c.rating?.count ? c.rating.average : -1);

export function filterChoices(
  choices: CompareChoice[],
  { scope, minStars, sort }: { scope: CompareScope; minStars: MinStars; sort: CompareSort },
): { shown: CompareChoice[]; hiddenUnrated: number } {
  const inScope = choices.filter((c) => c.suggested || scope === "all" || c.sameOffer);
  const rated = inScope.filter((c) => minStars === 0 || (c.rating?.count ? c.rating.average >= minStars : false));
  const hiddenUnrated = minStars === 0 ? 0 : inScope.filter((c) => !c.rating?.count).length;
  const byPrice = (a: CompareChoice, b: CompareChoice) => priceOf(a) - priceOf(b);
  const byRating = (a: CompareChoice, b: CompareChoice) => starsOf(b) - starsOf(a) || (b.rating?.count ?? 0) - (a.rating?.count ?? 0);
  const shown = [...rated].sort((a, b) =>
    (sort === "price" ? byPrice(a, b) || byRating(a, b) : byRating(a, b) || byPrice(a, b)) || a.title.localeCompare(b.title),
  );
  return { shown, hiddenUnrated };
}

/** "4.8★ (12 reviews)", or "No reviews yet". */
export function ratingText(rating: Rating | null | undefined): string {
  if (!rating?.count) return "No reviews yet";
  return `${rating.average.toFixed(1)}★ (${rating.count} review${rating.count === 1 ? "" : "s"})`;
}
