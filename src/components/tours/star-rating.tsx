import type { RatingSummary } from "@/lib/tours/reviews";

/** Read-only stars (rounded to whole stars; the exact average is in the label). */
export function Stars({ value, size = "text-base" }: { value: number; size?: string }) {
  const filled = Math.round(value);
  return (
    <span className={`inline-flex ${size} leading-none text-yellow-500`} aria-label={`${value.toFixed(1)} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} aria-hidden="true" className={i > filled ? "text-daet-ink/20" : ""}>
          ★
        </span>
      ))}
    </span>
  );
}

/** "★★★★☆ 4.3 (12)" or nothing when there are no reviews. */
export function RatingBadge({ summary, compact = false }: { summary: RatingSummary | null; compact?: boolean }) {
  if (!summary) return compact ? null : <span className="text-sm text-daet-ink/70">No reviews yet</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <Stars value={summary.average} size={compact ? "text-sm" : "text-base"} />
      <span className="font-bold text-daet-ink">{summary.average.toFixed(1)}</span>
      <span className="text-daet-ink/70">({summary.count})</span>
    </span>
  );
}
