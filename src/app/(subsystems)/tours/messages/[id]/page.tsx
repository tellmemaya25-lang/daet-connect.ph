import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { describeThread, KIND_LABELS, MESSAGE_PAGE_SIZE, type ChatMessage, type ConversationHeader } from "@/lib/tours/messaging";
import { isUuid } from "@/lib/tours/operator-access";
import { markConversationRead, signAttachments } from "../actions";
import { ChatThread } from "./chat-thread";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function ConversationPage({ params }: PageProps) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">Configure Supabase to use messages.</Notice>
      </PageFrame>
    );
  }

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/tours/messages/${id}`)}`);

  // Members (and admins) get the header; everyone else gets null.
  const { data: rawHeader, error: headerError } = await supabase.rpc("tours_conversation_header", { p_conversation_id: id });
  if (headerError) console.error("Conversation header error:", headerError);
  const header = rawHeader as ConversationHeader | null;
  if (!header) notFound();
  const view = describeThread(header, user.id, (await getAuthenticatedSession()).role);

  const { data: latest } = await supabase
    .from("tours_messages")
    .select("id, sender_id, message_text, attachment_url, created_at")
    .eq("conversation_id", header.id)
    .order("created_at", { ascending: false })
    .limit(MESSAGE_PAGE_SIZE);
  const messages = ((latest ?? []) as ChatMessage[]).reverse();
  const attachmentUrls = await signAttachments(messages.map((m) => m.attachment_url).filter((p): p is string => Boolean(p)));
  if (header.is_member) await markConversationRead(header.id);

  return (
    <PageFrame>
      <div className="mx-auto flex max-w-2xl flex-col">
        <Link href="/tours/messages" className="text-sm font-bold text-daet-ink/70 hover:text-daet-ink">
          ← All messages
        </Link>
        <header className="mt-3 rounded-2xl bg-white p-4">
          <Badge tone="neutral">{KIND_LABELS[header.kind] ?? "Chat"}</Badge>
          <h1 className="mt-1 text-lg font-black text-daet-ink">{view.title}</h1>
          <p className="text-xs text-daet-ink/70">{view.subtitle}</p>
          {view.link ? (
            <Link href={view.link.href} className="mt-1 inline-block text-xs font-bold text-daet-forest underline">
              {view.link.label}
            </Link>
          ) : null}
        </header>

        <ChatThread
          conversationId={header.id}
          viewerId={user.id}
          members={view.members}
          initialMessages={messages}
          initialAttachmentUrls={attachmentUrls}
          canSend={view.canSend}
          closedReason={view.closedReason}
          emptyText={view.emptyText}
        />
      </div>
    </PageFrame>
  );
}
