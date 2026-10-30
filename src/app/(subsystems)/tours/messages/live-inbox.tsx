"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Keeps the chat list current: any new message in the viewer's chats (row-
 * level security limits the feed to them) or a chat being read refreshes it.
 */
export function LiveInbox({ viewerId, children }: { viewerId: string; children: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    let timer: number | null = null;
    const refresh = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => router.refresh(), 400);
    };
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`inbox:${viewerId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tours_messages" }, refresh)
      .subscribe();
    window.addEventListener("daet:chat-read", refresh);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("daet:chat-read", refresh);
      void supabase.removeChannel(channel);
    };
  }, [router, viewerId]);
  return <>{children}</>;
}
