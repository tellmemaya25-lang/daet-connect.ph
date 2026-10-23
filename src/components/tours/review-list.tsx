import { Stars } from "@/components/tours/star-rating";
import type { Review } from "@/lib/tours/reviews";

const date = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });

/** Public review cards with the operator's reply. Reviewer names are not shown. */
export function ReviewList({ reviews, operatorName, emptyText = "No reviews yet." }: { reviews: Review[]; operatorName: string; emptyText?: string }) {
  if (reviews.length === 0) return <p className="text-sm text-daet-ink/60">{emptyText}</p>;
  return (
    <ul className="space-y-4">
      {reviews.map((review) => (
        <li key={review.id} className="rounded-2xl border border-daet-ink/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Stars value={review.rating} />
            <span className="text-xs text-daet-ink/50">Verified traveller · {date(review.created_at)}</span>
          </div>
          {review.comment ? <p className="mt-2 whitespace-pre-line text-sm leading-6 text-daet-ink/80">{review.comment}</p> : null}
          {review.operator_reply ? (
            <div className="mt-3 rounded-xl bg-daet-sand/50 p-3 text-sm">
              <p className="text-xs font-bold text-daet-ink/60">Reply from {operatorName}</p>
              <p className="mt-1 whitespace-pre-line text-daet-ink/80">{review.operator_reply}</p>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
