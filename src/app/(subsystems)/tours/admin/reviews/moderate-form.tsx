"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { setReviewHidden } from "@/app/(subsystems)/tours/reviews/actions";

/** Restore a hidden review, or hide one after the admin gives a reason (revealed on demand). */
export function ModerateForm({ reviewId, hidden, itemName }: { reviewId: string; hidden: boolean; itemName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!hidden && !open)
    return (
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        Hide…
        <span className="sr-only"> ({itemName})</span>
      </Button>
    );

  return (
    <form
      className="space-y-2"
      aria-busy={pending}
      action={(formData) =>
        startTransition(async () => {
          const result = await setReviewHidden(formData);
          if (!result.success) return setError(result.error ?? "The review could not be updated.");
          setError(null);
          setOpen(false);
          router.refresh();
        })
      }
    >
      <input type="hidden" name="reviewId" value={reviewId} />
      <input type="hidden" name="hidden" value={hidden ? "false" : "true"} />
      {hidden ? null : (
        <Field
          id={`reason-${reviewId}`}
          label={`Reason for hiding the ${itemName}`}
          hint="Required, at least 3 characters. The traveller and the operator will see it."
          required
        >
          <Input name="reason" maxLength={300} required minLength={3} autoFocus placeholder="e.g. abusive language" />
        </Field>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={hidden ? "secondary" : "danger"} loading={pending} loadingText="Saving…">
          {hidden ? "Show again" : "Hide review"}
          <span className="sr-only"> ({itemName})</span>
        </Button>
        {hidden ? null : (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => { setOpen(false); setError(null); }}>
            Cancel
          </Button>
        )}
      </div>
      {error ? <Notice variant="error">{error}</Notice> : null}
    </form>
  );
}
