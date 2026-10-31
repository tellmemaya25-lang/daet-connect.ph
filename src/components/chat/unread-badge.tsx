"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

let seq = 0;

/**
 * Unread chats for the signed-in viewer. Re-counts when a message arrives in
 * one of their chats (row-level security limits the feed) or when a chat is
 * read in this tab.
 */
export function useUnreadChats(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    const recount = async () => {
      const { data } = await supabase.rpc("tours_chat_inbox");
      if (!cancelled && Array.isArray(data)) setCount((data as Array<{ unread: number | null }>).reduce((sum, row) => sum + (Number(row.unread) > 0 ? 1 : 0), 0));
    };
    void recount();
    seq += 1;
    const channel = supabase
      .channel(`unread:${seq}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tours_messages" }, () => void recount())
      .subscribe();
    const onRead = () => void recount();
    window.addEventListener("daet:chat-read", onRead);
    return () => {
      cancelled = true;
      window.removeEventListener("daet:chat-read", onRead);
      void supabase.removeChannel(channel);
    };
  }, []);
  return count;
}

/** Unread chat count for the Messages tab and the account menu. */
export function UnreadMessagesBadge({ className = "" }: { className?: string }) {
  const count = useUnreadChats();
  if (count === 0) return null;
  return (
    <span className={`inline-grid min-w-5 place-items-center rounded-full bg-red-600 px-1.5 text-xs font-bold leading-5 text-white ${className}`}>
      {count > 9 ? "9+" : count}
      <span className="sr-only"> unread {count === 1 ? "chat" : "chats"}</span>
    </span>
  );
}
