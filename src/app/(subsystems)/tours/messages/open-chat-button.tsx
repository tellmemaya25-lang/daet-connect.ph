"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonVariant } from "@/components/ui/button";
import type { ChatTarget } from "@/lib/tours/messaging";
import { openChat } from "./actions";
import { openInDock } from "@/components/chat-dock/dock-bus";

/** "Message …" button: opens or reuses a chat (a booking's group chat by default). */
export function OpenChatButton({
  bookingId,
  target,
  label,
  variant = "secondary",
}: {
  bookingId?: string;
  target?: ChatTarget;
  label: string;
  variant?: ButtonVariant;
}) {
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
            const result = await openChat(target ?? { kind: "booking", bookingId: bookingId ?? "" });
            // Wide screens open the chat in the dock and stay on the page, like Messenger.
            if (result.conversationId) {
              if (!openInDock(result.conversationId)) router.push(`/tours/messages/${result.conversationId}`);
            }
            else setError(result.error ?? "The chat could not be opened.");
          })
        }
      >
        {label}
      </Button>
      {error ? (
        <p role="alert" className="mt-1 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
