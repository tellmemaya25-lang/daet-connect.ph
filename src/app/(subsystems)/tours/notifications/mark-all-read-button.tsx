"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { markNotificationsRead } from "./actions";

export function MarkAllReadButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      loading={pending}
      loadingText="Saving…"
      onClick={() =>
        startTransition(async () => {
          await markNotificationsRead();
          router.refresh();
        })
      }
    >
      Mark all read
    </Button>
  );
}
