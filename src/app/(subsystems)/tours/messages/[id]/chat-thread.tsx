"use client";

import { LineIcon } from "@/components/ui/icons";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  dayLabel,
  MESSAGE_MAX_LENGTH,
  mergeMessages,
  messageTime,
  senderLabel,
  type ChatMembers,
  type ChatMessage,
} from "@/lib/tours/messaging";
import { markConversationRead, sendMessage, signAttachments } from "../actions";

const time = (iso: string) => new Date(messageTime(iso)).toLocaleTimeString("en-PH", { timeStyle: "short", timeZone: "Asia/Manila" });

export function ChatThread({
  conversationId,
  viewerId,
  members,
  initialMessages,
  initialAttachmentUrls,
  canSend,
  closedReason,
  emptyText = "No messages yet. Say hello and ask anything about the tour.",
}: {
  conversationId: string;
  viewerId: string;
  members: ChatMembers;
  initialMessages: ChatMessage[];
  initialAttachmentUrls: Record<string, string>;
  canSend: boolean;
  closedReason: string | null;
  emptyText?: string;
}) {
  const [messages, setMessages] = useState(() => mergeMessages([], initialMessages));
  const [urls, setUrls] = useState(initialAttachmentUrls);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<"connecting" | "live" | "offline">("connecting");
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // New messages arrive through Realtime; RLS decides who receives them.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tours_messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const message = payload.new as ChatMessage;
          setMessages((current) => mergeMessages(current, [message]));
          if (message.attachment_url) {
            void signAttachments([message.attachment_url]).then((signed) => setUrls((current) => ({ ...current, ...signed })));
          }
          if (message.sender_id !== viewerId && document.visibilityState === "visible") void markConversationRead(conversationId);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setLive("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLive("offline");
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, viewerId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const groups = useMemo(() => {
    const result: Array<{ day: string; items: ChatMessage[] }> = [];
    for (const message of messages) {
      const day = dayLabel(message.created_at);
      const last = result[result.length - 1];
      if (last && last.day === day) last.items.push(message);
      else result.push({ day, items: [message] });
    }
    return result;
  }, [messages]);

  function submit() {
    if (!text.trim() && !file) return;
    const formData = new FormData();
    formData.set("conversationId", conversationId);
    formData.set("text", text);
    if (file) formData.set("attachment", file);
    setError(null);
    startTransition(async () => {
      const result = await sendMessage(formData);
      if (!result.message) {
        setError(result.error ?? "The message could not be sent.");
        return;
      }
      setMessages((current) => mergeMessages(current, [result.message!]));
      if (result.message.attachment_url && result.attachmentUrl) {
        setUrls((current) => ({ ...current, [result.message!.attachment_url!]: result.attachmentUrl! }));
      }
      setText("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  return (
    <div className="mt-4 flex flex-col">
      <p className="mb-2 text-right text-xs text-daet-ink/70" aria-live="polite">
        {live === "live" ? "● Live" : live === "connecting" ? "Connecting…" : "Offline: refresh to see new messages"}
      </p>

      <div className="min-h-[40vh] space-y-4 rounded-2xl bg-white p-4" role="log" aria-label="Messages">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-daet-ink/70">{emptyText}</p>
        ) : null}
        {groups.map((group) => (
          <section key={group.day} aria-label={group.day}>
            <p className="mb-2 text-center text-xs font-bold text-daet-ink/70">{group.day}</p>
            <ul className="space-y-2">
              {group.items.map((message) => {
                const mine = message.sender_id === viewerId;
                const url = message.attachment_url ? urls[message.attachment_url] : null;
                return (
                  <li key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${mine ? "bg-daet-forest text-white" : "bg-daet-sand/60 text-daet-ink"}`}>
                      {!mine ? <p className="text-xs font-bold opacity-75">{senderLabel(message.sender_id, viewerId, members)}</p> : null}
                      {message.attachment_url ? (
                        url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1 block">
                            <img src={url} alt="Photo attachment" className="max-h-64 rounded-xl object-cover" />
                          </a>
                        ) : (
                          <p className="mt-1 text-xs opacity-75"><LineIcon name="camera" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /> Photo</p>
                        )
                      ) : null}
                      {message.message_text ? <p className="whitespace-pre-wrap break-words text-sm">{message.message_text}</p> : null}
                      <p className={`mt-1 text-right text-[10px] ${mine ? "text-white" : "text-daet-ink/70"}`}>{time(message.created_at)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <div ref={bottomRef} />
      </div>

      {canSend ? (
        <form
          className="sticky bottom-0 mt-3 rounded-2xl bg-white p-3 shadow-[var(--shadow-float)]"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {error ? <Notice variant="error" className="mb-2">{error}</Notice> : null}
          <label htmlFor="message-text" className="sr-only">
            Message
          </label>
          <textarea
            id="message-text"
            rows={2}
            maxLength={MESSAGE_MAX_LENGTH}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="Write a message…"
            className="block w-full resize-none rounded-xl border border-daet-ink/20 px-3 py-2 text-base focus:border-daet-forest focus:outline-none focus:ring-2 focus:ring-daet-forest/20"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-3 text-sm font-bold text-daet-forest hover:bg-daet-sand">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <LineIcon name="camera" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /> {file ? <span className="max-w-[9rem] truncate">{file.name}</span> : "Photo"}
            </label>
            <span className="text-xs text-daet-ink/70">
              {text.length}/{MESSAGE_MAX_LENGTH}
            </span>
            <Button type="submit" loading={pending} loadingText="Sending…" disabled={!text.trim() && !file}>
              Send
            </Button>
          </div>
        </form>
      ) : closedReason ? (
        <Notice variant="info" className="mt-3">{closedReason}</Notice>
      ) : null}
    </div>
  );
}
