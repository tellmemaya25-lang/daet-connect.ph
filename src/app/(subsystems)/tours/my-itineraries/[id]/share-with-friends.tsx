"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { Person } from "@/lib/tours/friends";
import { shareItineraryWithFriends } from "../../friends/actions";

/** Tick the friends who can see this plan, then save. One server call per save. */
export function ShareWithFriends({ itineraryId, friends, initial }: { itineraryId: string; friends: Person[]; initial: string[] }) {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(initial));
  const [saved, setSaved] = useState<Set<string>>(() => new Set(initial));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!friends.length)
    return (
      <p className="text-sm text-daet-ink/70">
        <Link href="/tours/friends" className="font-bold text-daet-forest hover:underline dark:text-blue-300">
          Add friends
        </Link>{" "}
        to share this plan with them.
      </p>
    );

  const changed = chosen.size !== saved.size || [...chosen].some((id) => !saved.has(id));
  const toggle = (id: string) =>
    setChosen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const save = () =>
    startTransition(async () => {
      const result = await shareItineraryWithFriends(itineraryId, [...chosen]);
      if (!result.success) return setError(result.error ?? "The plan could not be shared.");
      setError(null);
      setSaved(new Set(chosen));
      setMessage(result.count ? `Shared with ${result.count} friend${result.count === 1 ? "" : "s"}.` : "Not shared with any friends.");
    });

  return (
    <fieldset aria-busy={pending}>
      <legend className="mb-2 text-sm font-bold text-daet-ink">Share with friends</legend>
      <ul className="max-h-60 space-y-1 overflow-y-auto">
        {friends.map((f) => (
          <li key={f.id}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-daet-ink">
              <Checkbox checked={chosen.has(f.id)} onChange={() => toggle(f.id)} />
              {f.name}
            </label>
          </li>
        ))}
      </ul>
      {error ? (
        <Notice variant="error" className="mt-2">
          {error}
        </Notice>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={save} disabled={pending || !changed}>
          Save sharing
        </Button>
        {message ? <p role="status" className="text-sm text-daet-ink/80">{message}</p> : null}
      </div>
    </fieldset>
  );
}
