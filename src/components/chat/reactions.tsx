"use client";

import { LineIcon } from "@/components/ui/icons";
import { REACTION_KEYS, REACTIONS, reactionSummary, type Reaction, type ReactionKey } from "@/lib/tours/messenger";

/**
 * Message reactions, Messenger-style. Reactions are emoji by nature, so this
 * is the one file the design rules allow emoji in (see design-rules.test.ts).
 */

/** The menu for one message: six reactions, then Reply and Copy. */
export function ReactionBar({ current, onPick, onReply, onCopy }: { current: ReactionKey | null; onPick: (key: ReactionKey) => void; onReply: () => void; onCopy?: () => void }) {
  return (
    <div role="menu" aria-label="React or reply" className="flex items-center gap-0.5 rounded-full bg-white p-1 shadow-[var(--shadow-float)]">
      {REACTION_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          role="menuitemradio"
          aria-checked={current === key}
          aria-label={REACTIONS[key].label}
          onClick={() => onPick(key)}
          className={`grid h-11 w-11 place-items-center rounded-full text-2xl transition hover:scale-110 hover:bg-slate-100 ${current === key ? "bg-blue-50" : ""}`}
        >
          <span aria-hidden="true">{REACTIONS[key].emoji}</span>
        </button>
      ))}
      <span className="mx-0.5 h-6 w-px bg-slate-200" aria-hidden="true" />
      <button type="button" role="menuitem" onClick={onReply} aria-label="Reply" className="grid h-11 w-11 place-items-center rounded-full text-daet-ink hover:bg-slate-100">
        <LineIcon name="return" className="h-5 w-5" />
      </button>
      {onCopy ? (
        <button type="button" role="menuitem" onClick={onCopy} aria-label="Copy" className="grid h-11 w-11 place-items-center rounded-full text-daet-ink hover:bg-slate-100">
          <LineIcon name="note" className="h-5 w-5" />
        </button>
      ) : null}
    </div>
  );
}

/** The reactions under a bubble; tapping one toggles your own. */
export function ReactionPills({ reactions, messageId, viewerId, onToggle, mine }: { reactions: Reaction[]; messageId: string; viewerId: string; onToggle: (key: ReactionKey) => void; mine: boolean }) {
  const summary = reactionSummary(reactions, messageId, viewerId);
  if (!summary.length) return null;
  return (
    <div className={`-mt-1 flex gap-1 ${mine ? "pr-2" : "pl-2"}`}>
      {summary.map((r) => (
        <button
          key={r.key}
          type="button"
          onClick={() => onToggle(r.key)}
          aria-pressed={r.mine}
          aria-label={`${REACTIONS[r.key].label}: ${r.count}${r.mine ? ", including you" : ""}`}
          className={`inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-sm shadow-[var(--shadow-float)] ${r.mine ? "bg-blue-50 text-blue-800" : "bg-white text-daet-ink"}`}
        >
          <span aria-hidden="true">{REACTIONS[r.key].emoji}</span>
          {r.count > 1 ? <span className="font-semibold">{r.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
