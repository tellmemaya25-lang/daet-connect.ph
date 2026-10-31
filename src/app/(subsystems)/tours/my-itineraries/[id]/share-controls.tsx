"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setItinerarySharing } from "../actions";

export function ShareControls({ id, initialToken, baseUrl }: { id: string; initialToken: string | null; baseUrl: string }) {
  const [token, setToken] = useState(initialToken);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const link = token ? `${baseUrl}/tours/itineraries/shared/${token}` : null;

  function toggle(shared: boolean) {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const result = await setItinerarySharing(id, shared);
      if (result.error) setError(result.error);
      else setToken(result.token);
    });
  }

  return (
    <div>
      {link ? (
        <>
          <p className="text-sm text-daet-ink/70">Anyone with this link can view the plan (not your name or account):</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input readOnly value={link} aria-label="Share link" className="min-h-11 w-full rounded-2xl border border-daet-ink/20 bg-daet-sand/30 px-3 text-sm" onFocus={(e) => e.currentTarget.select()} />
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(link).then(() => setCopied(true));
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="danger" onClick={() => toggle(false)} loading={pending}>
              Stop sharing
            </Button>
          </div>
        </>
      ) : (
        <Button variant="secondary" onClick={() => toggle(true)} loading={pending} loadingText="Creating link…">
          Create share link
        </Button>
      )}
      {error ? <p className="mt-2 text-sm font-semibold text-red-700 dark:text-red-300">{error}</p> : null}
    </div>
  );
}
