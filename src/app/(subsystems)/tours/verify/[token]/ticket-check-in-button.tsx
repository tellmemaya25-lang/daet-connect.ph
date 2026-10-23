"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { checkInByScan } from "@/app/(subsystems)/tours/guide/check-in/actions";

export function TicketCheckInButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      {error ? <Notice variant="error" className="mb-3 text-left">{error}</Notice> : null}
      <Button
        size="lg"
        fullWidth
        loading={pending}
        loadingText="Checking in…"
        onClick={() =>
          startTransition(async () => {
            const result = await checkInByScan(token);
            if (!result.success) setError(result.error ?? "Check-in failed.");
            else router.refresh();
          })
        }
      >
        Check guests in
      </Button>
    </div>
  );
}
