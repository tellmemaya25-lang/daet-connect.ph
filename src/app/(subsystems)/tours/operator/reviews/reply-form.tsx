"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { REPLY_MAX_LENGTH } from "@/lib/tours/reviews";
import { replyToReview } from "@/app/(subsystems)/tours/reviews/actions";

/** Operator's public reply. Saving an empty reply removes it. */
export function ReplyForm({ reviewId, current }: { reviewId: string; current: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!current);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <Button type="button" variant="ghost" onClick={() => setEditing(true)}>
        Edit reply
      </Button>
    );
  }

  return (
    <form
      className="space-y-2"
      action={(formData) =>
        startTransition(async () => {
          const result = await replyToReview(formData);
          if (!result.success) return setError(result.error ?? "The reply could not be saved.");
          setError(null);
          setEditing(false);
          router.refresh();
        })
      }
    >
      <input type="hidden" name="reviewId" value={reviewId} />
      {error ? <Notice variant="error">{error}</Notice> : null}
      <label htmlFor={`reply-${reviewId}`} className="sr-only">
        Public reply
      </label>
      <Textarea id={`reply-${reviewId}`} name="reply" rows={3} maxLength={REPLY_MAX_LENGTH} defaultValue={current ?? ""} placeholder="Thank the traveller or respond to their feedback. Shown publicly." />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending} loadingText="Saving…">
          {current ? "Save reply" : "Post reply"}
        </Button>
        {current ? (
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
