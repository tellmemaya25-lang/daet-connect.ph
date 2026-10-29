"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { ratingLabel, REVIEW_MAX_LENGTH } from "@/lib/tours/reviews";
import { submitReview, type ReviewActionState } from "@/app/(subsystems)/tours/reviews/actions";

const initialState: ReviewActionState = { error: null, success: null };

export function ReviewForm({ bookingId }: { bookingId: string }) {
  const [state, formAction, pending] = useActionState(submitReview, initialState);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const shown = hover || rating;

  if (state.success) return <Notice variant="success">{state.success}</Notice>;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="rating" value={rating || ""} />
      {state.error ? <Notice variant="error">{state.error}</Notice> : null}
      <fieldset>
        <legend className="text-sm font-bold text-daet-ink">Your rating</legend>
        <div className="mt-1 flex items-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`${value} star${value > 1 ? "s" : ""}`}
              aria-pressed={rating === value}
              onClick={() => setRating(value)}
              onMouseEnter={() => setHover(value)}
              className={`grid h-11 w-11 place-items-center rounded-full text-3xl transition hover:bg-daet-sand ${value <= shown ? "text-yellow-500" : "text-daet-ink/20"}`}
            >
              ★
            </button>
          ))}
          <span className="ml-2 text-sm font-bold text-daet-ink/70" aria-live="polite">
            {shown ? ratingLabel(shown) : ""}
          </span>
        </div>
      </fieldset>
      <Field id="comment" label="Tell other travellers about it" hint="Optional. Your name is not shown.">
        <Textarea id="comment" name="comment" rows={4} maxLength={REVIEW_MAX_LENGTH} placeholder="What did you enjoy? Anything to know before going?" />
      </Field>
      <Button type="submit" loading={pending} loadingText="Posting…" disabled={!rating}>
        Post review
      </Button>
    </form>
  );
}
