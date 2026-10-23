"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { openBookingChat } from "./actions";

/** "Message …" button on booking pages: opens or reuses the booking's chat. */
export function OpenChatButton({ bookingId, label, variant = "secondary" }: { bookingId: string; label: string; variant?: ButtonVariant }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <Button
        variant={variant}
        loading={pending}
        loadingText="Opening chat…"
        onClick={() =>
          startTransition(async () => {
            const result = await openBookingChat(bookingId);
            if (result.conversationId) router.push(`/tours/messages/${result.conversationId}`);
            else setError(result.error ?? "The chat could not be opened.");
          })
        }
      >
        {label}
      </Button>
      {error ? (
        <p role="alert" className="mt-1 text-sm font-semibold text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
