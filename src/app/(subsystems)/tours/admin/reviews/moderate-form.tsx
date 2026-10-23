"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { setReviewHidden } from "@/app/(subsystems)/tours/reviews/actions";

/** Hide (with a reason) or restore a review. */
export function ModerateForm({ reviewId, hidden }: { reviewId: string; hidden: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-start"
      action={(formData) =>
        startTransition(async () => {
          const result = await setReviewHidden(formData);
          if (!result.success) return setError(result.error ?? "The review could not be updated.");
          setError(null);
          router.refresh();
        })
      }
    >
      <input type="hidden" name="reviewId" value={reviewId} />
      <input type="hidden" name="hidden" value={hidden ? "false" : "true"} />
      {hidden ? null : (
        <div className="flex-1">
          <label htmlFor={`reason-${reviewId}`} className="sr-only">
            Reason for hiding
          </label>
          <Input id={`reason-${reviewId}`} name="reason" maxLength={300} placeholder="Reason (e.g. abusive language, not about the tour)" />
        </div>
      )}
      <Button type="submit" variant={hidden ? "secondary" : "danger"} loading={pending} loadingText="Saving…">
        {hidden ? "Show again" : "Hide review"}
      </Button>
      {error ? <Notice variant="error" className="sm:basis-full">{error}</Notice> : null}
    </form>
  );
}
