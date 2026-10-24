"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { reviewMerch } from "./actions";

/** Approve, or reject with a note the operator will see. */
export function MerchReviewForm({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submit = (formData: FormData) =>
    startTransition(async () => {
      const result = await reviewMerch(formData);
      if (!result.success) return setError(result.error ?? "The decision could not be saved.");
      setError(null);
      router.refresh();
    });

  return (
    <form action={submit} className="flex w-full flex-col gap-2 sm:flex-row sm:items-start">
      <input type="hidden" name="id" value={id} />
      <div className="flex-1">
        <label htmlFor={`notes-${id}`} className="sr-only">
          Note to the operator
        </label>
        <Input id={`notes-${id}`} name="notes" maxLength={300} placeholder="Note (needed to reject)" />
      </div>
      <Button type="submit" name="decision" value="approved" loading={pending}>
        Approve
      </Button>
      <Button type="submit" name="decision" value="rejected" variant="danger" disabled={pending}>
        Reject
      </Button>
      {error ? <Notice variant="error" className="sm:basis-full">{error}</Notice> : null}
    </form>
  );
}
