"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { checkInManually } from "@/app/(subsystems)/tours/guide/check-in/actions";

export function RosterCheckInButton({ bookingId, participantId, label }: { bookingId: string; participantId?: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant={participantId ? "secondary" : "primary"}
        loading={pending}
        loadingText="Saving…"
        onClick={() => {
          const formData = new FormData();
          formData.set("bookingId", bookingId);
          if (participantId) formData.set("participantId", participantId);
          startTransition(async () => {
            const result = await checkInManually(formData);
            if (!result.success) setError(result.error ?? "Check-in failed.");
            else {
              setError(null);
              router.refresh();
            }
          });
        }}
      >
        {label}
      </Button>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
