"use client";

import { formatPeso } from "@/lib/money";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { openChat, sendMessage } from "@/app/(subsystems)/tours/messages/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AssistantEvent } from "@/lib/tours/assistant/respond";
import type { AssistantCard, HandoffCard } from "@/lib/tours/assistant/tools";

type Turn = { role: "user" | "assistant"; content: string; cards?: AssistantCard[]; mode?: "ai" | "basic" };

const STORAGE_KEY = "daet-assistant-v1";
const MESSAGE_MAX = 1000;
export const ASSISTANT_EXAMPLES = ["Open dates for Calaguas this weekend?", "Paano mag-cancel ng booking?", "Where is my ticket?", "What time does the Heritage Center open?"];

function load(): Turn[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const turns = raw ? (JSON.parse(raw) as Turn[]) : [];
    return Array.isArray(turns) ? turns.slice(-30) : [];
  } catch {
    return [];
  }
}
function save(turns: Turn[]) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(turns.slice(-30)));
  } catch {
    // Private mode or storage full: the chat still works, it just isn't kept.
  }
}

const peso = formatPeso;

/** The travel assistant conversation: used by the floating widget and the /tours/help page. */
export function AssistantChat({ signedIn, onNavigate, autoFocus = false }: { signedIn: boolean; onNavigate?: () => void; autoFocus?: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setTurns(load()), []);
  useEffect(() => {
    logRef.current?.lastElementChild?.scrollIntoView({ block: "end" });
  }, [turns]);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  async function send(value: string) {
    const question = value.trim().slice(0, MESSAGE_MAX);
    if (!question || busy) return;
    setError(null);
    setText("");
    setBusy(true);
    const history: Turn[] = [...turns, { role: "user", content: question }];
    let reply: Turn = { role: "assistant", content: "" };
    setTurns([...history, reply]);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history.filter((t) => t.content).map((t) => ({ role: t.role, content: t.content })) }),
      });
      if (!response.ok || !response.body) throw new Error(String(response.status));
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as AssistantEvent;
          if (event.t === "mode") reply = { ...reply, mode: event.mode };
          else if (event.t === "text") reply = { ...reply, content: reply.content + event.v };
          else if (event.t === "cards") reply = { ...reply, cards: event.cards };
          else if (event.t === "error") reply = { ...reply, content: event.message };
          setTurns([...history, reply]);
        }
      }
      if (!reply.content.trim()) reply = { ...reply, content: "Sorry, I couldn't answer that. Please try again." };
      const final = [...history, reply];
      setTurns(final);
      save(final);
    } catch {
      setTurns(history);
      save(history);
      setText(question);
      setError("The assistant couldn't be reached. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const lastMode = [...turns].reverse().find((t) => t.mode)?.mode;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-daet-ink/10 px-4 py-2 text-xs text-daet-ink/70">
        <span>{lastMode === "basic" ? <Badge tone="neutral">Basic mode</Badge> : lastMode === "ai" ? <Badge tone="info">AI</Badge> : "Answers come from CONNECT-Daet's own listings."}</span>
        {turns.length ? (
          <button
            type="button"
            onClick={() => {
              setTurns([]);
              save([]);
              inputRef.current?.focus();
            }}
            className="min-h-11 font-bold text-daet-forest underline"
          >
            New chat
          </button>
        ) : null}
      </div>

      <ol ref={logRef} aria-live="polite" aria-label="Conversation" className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {turns.length === 0 ? (
          <li className="space-y-3">
            <p className="text-sm text-daet-ink">
              Hi! Ask me about tours and open dates, prices, places and events in Daet{signedIn ? ", or about your own bookings, payments and tickets" : ""}. I can also pass you to a person.
            </p>
            <div className="flex flex-wrap gap-2">
              {ASSISTANT_EXAMPLES.map((example) => (
                <button key={example} type="button" onClick={() => send(example)} className="min-h-11 rounded-full border border-daet-ink/15 bg-white px-3 text-left text-xs font-semibold text-daet-ink hover:bg-daet-sand">
                  {example}
                </button>
              ))}
            </div>
          </li>
        ) : null}
        {turns.map((turn, i) => (
          <li key={i} className={turn.role === "user" ? "flex justify-end" : ""}>
            {turn.role === "user" ? (
              <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-daet-forest px-3 py-2 text-sm text-white">{turn.content}</p>
            ) : (
              <div className="max-w-[92%] space-y-2">
                <p className="whitespace-pre-wrap break-words rounded-2xl bg-daet-sand/60 px-3 py-2 text-sm text-daet-ink">
                  {turn.content || (busy && i === turns.length - 1 ? <span className="text-daet-ink/70">Thinking…</span> : null)}
                </p>
                {turn.cards?.length ? <AssistantCards cards={turn.cards} signedIn={signedIn} onNavigate={onNavigate} /> : null}
              </div>
            )}
          </li>
        ))}
      </ol>

      <form
        className="border-t border-daet-ink/10 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send(text);
        }}
      >
        {error ? (
          <p role="alert" className="mb-2 text-sm font-semibold text-rose-700">
            {error}
          </p>
        ) : null}
        <label htmlFor="assistant-input" className="sr-only">
          Ask the travel assistant
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="assistant-input"
            ref={inputRef}
            rows={1}
            maxLength={MESSAGE_MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(text);
              }
            }}
            placeholder="Ask anything about your trip…"
            className="block min-h-11 w-full resize-none rounded-xl border border-daet-ink/20 px-3 py-2 text-base focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
          />
          <Button type="submit" loading={busy} loadingText="…" disabled={!text.trim()} aria-label="Send">
            Send
          </Button>
        </div>
        <p className="mt-2 text-[11px] leading-4 text-daet-ink/70">Chats aren&apos;t saved on our servers. Never share passwords or card numbers.</p>
      </form>
    </div>
  );
}

function AssistantCards({ cards, signedIn, onNavigate }: { cards: AssistantCard[]; signedIn: boolean; onNavigate?: () => void }) {
  const linkClass = "inline-flex min-h-11 items-center rounded-full border border-daet-forest/30 bg-white px-3 text-xs font-bold text-daet-forest hover:bg-daet-forest/5";
  const links = cards.filter((c) => c.type === "link");
  return (
    <div className="space-y-2">
      {cards.map((card, i) => {
        if (card.type === "tour") {
          return (
            <div key={i} className="rounded-2xl border border-daet-ink/10 bg-white p-3">
              <p className="font-bold text-daet-ink">{card.title}</p>
              <p className="text-xs text-daet-ink/70">{[card.location, card.duration, card.priceFrom ? `from ${peso(card.priceFrom)} per person` : null].filter(Boolean).join(" · ")}</p>
              <Link href={card.href} onClick={onNavigate} className={`${linkClass} mt-2`}>
                View tour
              </Link>
            </div>
          );
        }
        if (card.type === "booking") {
          return (
            <div key={i} className="rounded-2xl border border-daet-ink/10 bg-white p-3">
              <p className="font-bold text-daet-ink">
                {card.title} <span className="font-normal text-daet-ink/70">· {card.reference}</span>
              </p>
              <p className="text-xs text-daet-ink/70">
                {card.date} · {card.statusLabel}
              </p>
              <p className="mt-1 text-sm text-daet-ink">{card.nextStep}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {card.links.map((link) => (
                  <Link key={link.href} href={link.href} onClick={onNavigate} className={linkClass}>
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          );
        }
        if (card.type === "handoff") return <HandoffPanel key={i} card={card} signedIn={signedIn} onNavigate={onNavigate} />;
        return null;
      })}
      {links.length ? (
        <div className="flex flex-wrap gap-2">
          {links.map((card) =>
            card.type === "link" ? (
              <Link key={card.href} href={card.href} onClick={onNavigate} className={linkClass}>
                {card.label}
              </Link>
            ) : null,
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Pre-filled message to a person; the tourist reads and edits it, then sends it themselves. */
function HandoffPanel({ card, signedIn, onNavigate }: { card: HandoffCard; signedIn: boolean; onNavigate?: () => void }) {
  const [message, setMessage] = useState(card.summary);
  const [state, setState] = useState<{ sent?: string; error?: string }>({});
  const [pending, startTransition] = useTransition();
  const who = card.target === "operator" ? (card.operatorName ?? "the operator") : "the Daet Tourism Office";
  const id = `handoff-${card.bookingId ?? "office"}`;

  if (!signedIn || !card.signedIn) {
    return (
      <div className="rounded-2xl border border-daet-forest/20 bg-white p-3 text-sm">
        <p className="text-daet-ink">Sign in so {who} can reply to you.</p>
        <Link href="/login" onClick={onNavigate} className="mt-2 inline-flex min-h-11 items-center rounded-full bg-daet-forest px-4 text-xs font-bold text-white">
          Sign in to message
        </Link>
      </div>
    );
  }
  if (state.sent) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        Sent to {who}. They&apos;ll reply in Messages.{" "}
        <Link href={`/tours/messages/${state.sent}`} onClick={onNavigate} className="font-bold underline">
          Open the chat
        </Link>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-daet-forest/20 bg-white p-3">
      <label htmlFor={id} className="text-xs font-bold text-daet-ink">
        Message to {who} (edit before sending)
      </label>
      <textarea id={id} rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1 block w-full rounded-xl border border-daet-ink/20 px-3 py-2 text-sm" />
      {state.error ? (
        <p role="alert" className="mt-1 text-sm font-semibold text-rose-700">
          {state.error}
        </p>
      ) : null}
      <Button
        className="mt-2"
        loading={pending}
        loadingText="Sending…"
        disabled={!message.trim()}
        onClick={() =>
          startTransition(async () => {
            const opened = await openChat(card.bookingId ? { kind: "booking", bookingId: card.bookingId } : { kind: "tourist_office" });
            if (!opened.conversationId) {
              setState({ error: opened.error ?? "The chat could not be opened." });
              return;
            }
            const form = new FormData();
            form.set("conversationId", opened.conversationId);
            form.set("text", message.trim());
            const sent = await sendMessage(form);
            setState(sent.message ? { sent: opened.conversationId } : { error: sent.error ?? "The message could not be sent." });
          })
        }
      >
        Send to {card.target === "operator" ? "operator" : "Tourism Office"}
      </Button>
    </div>
  );
}
