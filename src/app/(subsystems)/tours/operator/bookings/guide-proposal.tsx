"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { BoardRow } from "./board-types";
import { reviewGuideProposal } from "./actions";

/**
 * The guide the Tourism Office admin (or the system, from the package's area)
 * proposed for this tour. The operator approves to assign them, or asks for
 * the next free guide.
 */
export function GuideProposal({ bookingId, proposal }: { bookingId: string; proposal: NonNullable<BoardRow["guideProposal"]> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const answer = (approve: boolean) =>
    start(async () => {
      const result = await reviewGuideProposal(bookingId, approve);
      setMessage(result.success ? { tone: "ok", text: result.message ?? "Saved." } : { tone: "error", text: result.error ?? "Could not save." });
      if (result.success) router.refresh();
    });

  if (proposal.status === "none_available" || !proposal.guideId) {
    return (
      <p className="mt-3 rounded-xl bg-yellow-50 p-3 text-sm text-daet-ink dark:bg-yellow-950/30">
        <span className="font-bold">No free guide in this area that day.</span> Pick one yourself below, or the Tourism Office can propose one.
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-daet-ink dark:bg-blue-950/40" aria-live="polite">
      <p>
        <span className="font-bold">{proposal.guideName ?? "A guide"}</span> is proposed
        {proposal.by === "admin" ? " by the Tourism Office" : " from the guides who cover this area"}. Approve to assign them.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="md" disabled={pending} onClick={() => answer(true)}>
          Approve guide
        </Button>
        <Button size="md" variant="ghost" disabled={pending} onClick={() => answer(false)}>
          Choose another
        </Button>
      </div>
      {message ? <p className={`mt-2 font-semibold ${message.tone === "error" ? "text-red-700 dark:text-red-300" : "text-green-800 dark:text-green-300"}`}>{message.text}</p> : null}
    </div>
  );
}
