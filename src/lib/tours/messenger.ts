import { dayLabel, messageTime, type ChatMessage } from "@/lib/tours/messaging";

/**
 * Messenger-style chat helpers: grouping bubbles into runs from the same
 * sender, the "Seen" line, reactions and optimistic sends. Pure functions,
 * so the thread, the chat dock and the tests share them.
 */

export const REACTIONS = {
  like: { emoji: "\u{1F44D}", label: "Like" },
  love: { emoji: "❤️", label: "Love" },
  haha: { emoji: "\u{1F602}", label: "Haha" },
  wow: { emoji: "\u{1F62E}", label: "Wow" },
  sad: { emoji: "\u{1F622}", label: "Sad" },
  thanks: { emoji: "\u{1F64F}", label: "Thanks" },
} as const;
export type ReactionKey = keyof typeof REACTIONS;
export const REACTION_KEYS = Object.keys(REACTIONS) as ReactionKey[];
export const isReactionKey = (value: unknown): value is ReactionKey => typeof value === "string" && value in REACTIONS;

export type Reaction = { message_id: string; profile_id: string; reaction: ReactionKey };
export type ReadMark = { profile_id: string; last_read_at: string };

/** A message on screen: sent, still sending, or failed (with what to resend). */
export type ThreadMessage = ChatMessage & {
  reply_to_id?: string | null;
  status?: "sending" | "failed";
  /** Kept for a retry after a failed send. */
  draft?: { text: string; file: File | null; replyToId: string | null };
};

/** Where a bubble sits in a run from the same sender, for Messenger's rounded corners. */
export type RunPosition = "single" | "first" | "middle" | "last";
export type ThreadItem =
  | { type: "day"; key: string; label: string }
  | { type: "message"; key: string; message: ThreadMessage; mine: boolean; position: RunPosition; showSender: boolean; showTime: boolean };

/** Runs break when the sender changes, the day changes, or more than 5 minutes pass. */
export const RUN_GAP_MS = 5 * 60 * 1000;

export function threadItems(messages: ThreadMessage[], viewerId: string): ThreadItem[] {
  const items: ThreadItem[] = [];
  let lastDay = "";
  messages.forEach((message, i) => {
    const day = dayLabel(message.created_at);
    if (day !== lastDay) {
      items.push({ type: "day", key: `day-${day}-${i}`, label: day });
      lastDay = day;
    }
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const joins = (a: ThreadMessage | undefined, b: ThreadMessage | undefined) =>
      Boolean(a && b && a.sender_id === b.sender_id && dayLabel(a.created_at) === dayLabel(b.created_at) && Math.abs(messageTime(b.created_at) - messageTime(a.created_at)) <= RUN_GAP_MS);
    const withPrev = joins(prev, message);
    const withNext = joins(message, next);
    const position: RunPosition = withPrev && withNext ? "middle" : withPrev ? "last" : withNext ? "first" : "single";
    const mine = message.sender_id === viewerId;
    items.push({ type: "message", key: message.id, message, mine, position, showSender: !mine && !withPrev, showTime: !withNext });
  });
  return items;
}

/** Tailwind corner classes for a bubble's place in its run. */
export function bubbleCorners(position: RunPosition, mine: boolean): string {
  if (position === "single") return "rounded-2xl";
  const side = mine ? "r" : "l";
  if (position === "first") return `rounded-2xl rounded-b${side}-md`;
  if (position === "last") return `rounded-2xl rounded-t${side}-md`;
  return `rounded-2xl rounded-${side}-md`;
}

/** The id of my latest message that someone else has read, for the "Seen" line under it. */
export function seenMessageId(messages: ThreadMessage[], viewerId: string, marks: ReadMark[]): string | null {
  const latestRead = marks.reduce((max, m) => Math.max(max, messageTime(m.last_read_at)), 0);
  if (!latestRead) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.sender_id !== viewerId || m.status) continue;
    return messageTime(m.created_at) <= latestRead ? m.id : null;
  }
  return null;
}

/** Reactions on one message, most used first, with whether the viewer chose each. */
export function reactionSummary(reactions: Reaction[], messageId: string, viewerId: string): Array<{ key: ReactionKey; count: number; mine: boolean }> {
  const counts = new Map<ReactionKey, { count: number; mine: boolean }>();
  for (const r of reactions) {
    if (r.message_id !== messageId) continue;
    const entry = counts.get(r.reaction) ?? { count: 0, mine: false };
    entry.count += 1;
    entry.mine ||= r.profile_id === viewerId;
    counts.set(r.reaction, entry);
  }
  return [...counts.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.count - a.count || REACTION_KEYS.indexOf(a.key) - REACTION_KEYS.indexOf(b.key));
}

/** One reaction per person per message: adding replaces, the same one again removes. */
export function applyReaction(reactions: Reaction[], change: { message_id: string; profile_id: string; reaction: ReactionKey | null }): Reaction[] {
  const rest = reactions.filter((r) => !(r.message_id === change.message_id && r.profile_id === change.profile_id));
  return change.reaction ? [...rest, { message_id: change.message_id, profile_id: change.profile_id, reaction: change.reaction }] : rest;
}

/** The reaction the viewer would end up with after tapping one: tapping the same one removes it. */
export function toggledReaction(reactions: Reaction[], messageId: string, viewerId: string, tapped: ReactionKey): ReactionKey | null {
  const current = reactions.find((r) => r.message_id === messageId && r.profile_id === viewerId)?.reaction ?? null;
  return current === tapped ? null : tapped;
}

/** Short preview of a quoted message. */
export function quotePreview(message: Pick<ChatMessage, "message_text" | "attachment_url"> | null | undefined): string {
  if (!message) return "Original message not available";
  const text = (message.message_text ?? "").replace(/\s+/g, " ").trim();
  if (text) return text.length > 80 ? `${text.slice(0, 79)}…` : text;
  return message.attachment_url ? "Photo" : "Message";
}

/** Typing pings expire after a few seconds unless refreshed. */
export const TYPING_TTL_MS = 5000;
export const TYPING_THROTTLE_MS = 3000;
export function whoIsTyping(typing: Record<string, number>, now: number, viewerId: string): string[] {
  return Object.entries(typing)
    .filter(([who, until]) => who !== viewerId && until > now)
    .map(([who]) => who);
}
