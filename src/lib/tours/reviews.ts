/** Reviews & ratings (F8). The database functions enforce the same rules. */

export const REVIEW_MAX_LENGTH = 2000;
export const REPLY_MAX_LENGTH = 1000;

export type Review = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  operator_reply: string | null;
  replied_at: string | null;
  is_hidden: boolean;
  hidden_reason?: string | null;
};

export type RatingSummary = { average: number; count: number };

export function parseReviewForm(formData: FormData): { ok: true; rating: number; comment: string } | { ok: false; error: string } {
  const rating = Number(formData.get("rating"));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: "Choose a rating from 1 to 5 stars." };
  const comment = String(formData.get("comment") ?? "").trim();
  if (comment.length > REVIEW_MAX_LENGTH) return { ok: false, error: `Reviews can be at most ${REVIEW_MAX_LENGTH} characters.` };
  return { ok: true, rating, comment };
}

export function parseReply(value: unknown): { ok: true; reply: string } | { ok: false; error: string } {
  const reply = String(value ?? "").trim();
  if (reply.length > 0 && reply.length < 2) return { ok: false, error: "Write a short reply (at least 2 characters)." };
  if (reply.length > REPLY_MAX_LENGTH) return { ok: false, error: `Replies can be at most ${REPLY_MAX_LENGTH} characters.` };
  return { ok: true, reply };
}

/** Rows from the tours_*_ratings views (numeric comes back as a string). */
export function toSummary(row: { review_count?: number | string | null; average_rating?: number | string | null } | null | undefined): RatingSummary | null {
  const count = Number(row?.review_count ?? 0);
  const average = Number(row?.average_rating ?? 0);
  return count > 0 && Number.isFinite(average) ? { count, average } : null;
}

export function formatRating(summary: RatingSummary | null): string {
  if (!summary) return "No reviews yet";
  return `${summary.average.toFixed(1)} (${summary.count} review${summary.count === 1 ? "" : "s"})`;
}

export function ratingLabel(rating: number): string {
  return ["", "Poor", "Fair", "Good", "Very good", "Excellent"][Math.max(0, Math.min(5, Math.round(rating)))] ?? "";
}

/** Count of each star level, 5 → 1, for the summary bars. */
export function distribution(ratings: number[]): Array<{ stars: number; count: number }> {
  return [5, 4, 3, 2, 1].map((stars) => ({ stars, count: ratings.filter((r) => r === stars).length }));
}
