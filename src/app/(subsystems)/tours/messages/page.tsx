import { AiAvatar } from "@/components/chat/ai-avatar";
import { ASSISTANT_NAME } from "@/lib/tours/assistant/name";
import { EmptyState } from "@/components/ui/empty-state";
import { LineIcon } from "@/components/ui/icons";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { OpenChatButton } from "./open-chat-button";
import { dayLabel, inboxFilters, isConversationKind, KIND_LABELS } from "@/lib/tours/messaging";

export const dynamic = "force-dynamic";

type InboxRow = {
  conversation_id: string;
  kind: string;
  title: string | null;
  subtitle: string | null;
  last_message_at: string;
  last_message: string | null;
  last_sender_id: string | null;
  unread: number;
};

type PageProps = { searchParams: Promise<{ kind?: string }> };

export default async function MessagesInboxPage({ searchParams }: PageProps) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">Configure Supabase to use messages.</Notice>
      </PageFrame>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/tours/messages")}`);

  const { kind: rawKind } = await searchParams;
  const { data, error } = await supabase.rpc("tours_chat_inbox");
  if (error) console.error("Inbox error:", error);
  const all = (data ?? []) as InboxRow[];
  const filters = inboxFilters(all.map((row) => row.kind));
  const kind = isConversationKind(rawKind) && filters.some((f) => f.kind === rawKind) ? rawKind : null;
  const rows = kind ? all.filter((row) => row.kind === kind) : all;

  // The Tourism Office can start a chat with any operator.
  const isAdmin = (await getAuthenticatedSession()).role === "admin";
  const { data: operatorList } = isAdmin
    ? await supabase.from("tours_operators").select("id, business_name, accreditation_status").order("business_name").limit(200)
    : { data: null };

  return (
    <PageFrame>
      <div className="mx-auto max-w-2xl">
        <h1 className="display-2 text-daet-ink">Messages</h1>
        <p className="mt-2 text-daet-ink">Booking chats, private chats with your guide or tourists, operator–guide chats and Tourism Office support. Only the people in a chat can read it.</p>

        {filters.length > 0 ? (
          <nav aria-label="Filter conversations" className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {filters.map((filter) => {
              const active = filter.kind === kind;
              return (
                <Link
                  key={filter.label}
                  href={filter.kind ? `/tours/messages?kind=${filter.kind}` : "/tours/messages"}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-[15px] font-bold transition active:scale-[0.98] ${active ? "bg-blue-600 text-white" : "bg-white text-daet-ink hover:bg-blue-50"}`}
                >
                  {filter.label}
                </Link>
              );
            })}
          </nav>
        ) : null}

        {isAdmin ? (
          <details className="mt-4 rounded-2xl bg-white p-4">
            <summary className="min-h-11 cursor-pointer content-center text-sm font-bold text-daet-forest">Message an operator</summary>
            {(operatorList ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-daet-ink/70">No operators have registered yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-daet-ink/10">
                {(operatorList ?? []).map((operator) => (
                  <li key={operator.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-sm font-bold text-daet-ink">
                      {operator.business_name} <span className="font-normal text-daet-ink/70">· {String(operator.accreditation_status)}</span>
                    </span>
                    <OpenChatButton target={{ kind: "operator_admin", operatorId: operator.id }} label="Message" variant="ghost" />
                  </li>
                ))}
              </ul>
            )}
          </details>
        ) : null}

        <Link
          href="/tours/messages/ai"
          className="mt-6 flex min-h-11 items-center gap-3 rounded-2xl bg-white p-3 transition hover:bg-blue-50 active:scale-[0.99]"
        >
          <AiAvatar />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate font-bold text-daet-ink">{ASSISTANT_NAME}</span>
              <Badge tone="info">Pinned</Badge>
            </span>
            <span className="block truncate text-sm text-slate-600">Food, stays, directions and trip costs in Daet. Ask anything.</span>
          </span>
        </Link>

        {error ? (
          <Notice variant="error" className="mt-6">Messages could not be loaded. Refresh to try again.</Notice>
        ) : rows.length === 0 ? (
          <EmptyState className="mt-6" icon={<LineIcon name="chat" />} title="No conversations yet" description="Open a booking, a guide or the Tourism Office and tap Message to start a chat." />
        ) : (
          <ul className="mt-6 space-y-2">
            {rows.map((row) => {
              const preview = row.last_message ?? (row.last_sender_id ? "Photo" : "No messages yet");
              const mine = row.last_sender_id === user.id;
              return (
                <li key={row.conversation_id}>
                  <Link href={`/tours/messages/${row.conversation_id}`} className="flex min-h-11 items-start gap-3 rounded-2xl bg-white p-4 transition hover:bg-blue-50 active:scale-[0.99]">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={`truncate text-daet-ink font-bold`}>{row.title ?? "Conversation"}</p>
                        <span className="shrink-0 text-sm text-slate-600">{dayLabel(row.last_message_at)}</span>
                      </div>
                      <p className="text-sm text-slate-600">
                        <span className="font-semibold">{isConversationKind(row.kind) ? KIND_LABELS[row.kind] : "Chat"}</span>
                        {row.subtitle ? ` · ${row.subtitle}` : ""}
                      </p>
                      <p className={`mt-1 truncate text-sm ${row.unread > 0 ? "font-semibold text-daet-ink" : "text-daet-ink/70"}`}>
                        {mine ? "You: " : ""}
                        {preview}
                      </p>
                    </div>
                    {row.unread > 0 ? <Badge tone="brand">{row.unread > 99 ? "99+" : row.unread}</Badge> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageFrame>
  );
}
