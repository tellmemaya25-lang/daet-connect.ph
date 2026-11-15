"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { BAN_CHOICES } from "@/lib/tours/admin-moderation";
import { banAccount } from "./actions";

/** Ban one account for 7 days, 30 days or until lifted, with a reason. */
export function BanButtons({ profileId, name }: { profileId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  if (!open)
    return (
      <Button type="button" variant="ghost" onClick={() => setOpen(true)} aria-label={`Ban ${name}`}>
        Ban…
      </Button>
    );
  return (
    <div className="mt-2 w-full space-y-2" aria-busy={pending}>
      <Field id={`ban-${profileId}`} label={`Why ban ${name}?`}>
        <Input maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        {BAN_CHOICES.map((b) => (
          <Button
            key={b.label}
            type="button"
            variant="danger"
            disabled={pending || reason.trim().length < 3}
            onClick={() =>
              startTransition(async () => {
                const r = await banAccount(profileId, b.days, reason);
                setResult(r);
                if (r.ok) router.refresh();
              })
            }
          >
            {b.label}
          </Button>
        ))}
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
      {result ? <Notice variant={result.ok ? "success" : "error"}>{result.message}</Notice> : null}
    </div>
  );
}
