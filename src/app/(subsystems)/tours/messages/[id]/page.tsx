import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MESSAGE_PAGE_SIZE, type ChatMembers, type ChatMessage } from "@/lib/tours/messaging";
import { isUuid } from "@/lib/tours/operator-access";
import { markConversationRead, signAttachments } from "../actions";
import { ChatThread } from "./chat-thread";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));

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

  // RLS: only the booking's tourist, operator, assigned guide (and admins) see the conversation.
  const { data: conversation } = await supabase
    .from("tours_conversations")
    .select(
      `id, booking_id,
       tours_bookings ( id, user_id, booking_reference, status, tour_date, contact_name, assigned_guide_id,
         tours_guides ( profile_id ),
         tours_packages ( title, tours_operators ( profile_id, business_name ) ) )`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!conversation) notFound();

  const booking = one(conversation.tours_bookings) as {
    id: string; user_id: string; booking_reference: string; status: string; tour_date: string; contact_name: string;
    tours_guides: { profile_id: string } | { profile_id: string }[] | null;
    tours_packages: { title: string; tours_operators: { profile_id: string; business_name: string } | { profile_id: string; business_name: string }[] | null } | null;
  } | null;
  if (!booking) notFound();
  const pkg = one(booking.tours_packages);
  const operator = one(pkg?.tours_operators);
  const guide = one(booking.tours_guides);

  const members: ChatMembers = {
    touristId: booking.user_id,
    touristName: booking.contact_name,
    operatorProfileId: operator?.profile_id ?? null,
    operatorName: operator?.business_name ?? "Operator",
    guideProfileId: guide?.profile_id ?? null,
  };

  const { data: latest } = await supabase
    .from("tours_messages")
    .select("id, sender_id, message_text, attachment_url, created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(MESSAGE_PAGE_SIZE);
  const messages = ((latest ?? []) as ChatMessage[]).reverse();
  const attachmentUrls = await signAttachments(messages.map((m) => m.attachment_url).filter((p): p is string => Boolean(p)));
  const isMember = user.id === members.touristId || user.id === members.operatorProfileId || user.id === members.guideProfileId;
  if (isMember) await markConversationRead(conversation.id);

  const backHref = user.id === members.touristId ? `/tours/bookings/${booking.id}` : "/tours/messages";
  const closed = booking.status === "cancelled" || booking.status === "rejected";

  return (
    <PageFrame>
      <div className="mx-auto flex max-w-2xl flex-col">
        <Link href="/tours/messages" className="text-sm font-bold text-daet-ink/70 hover:text-daet-ink">
          ← All messages
        </Link>
        <header className="mt-3 rounded-2xl border border-daet-ink/10 bg-white p-4 shadow-sm">
          <p className="text-lg font-black text-daet-ink">{pkg?.title ?? "Tour booking"}</p>
          <p className="text-xs text-daet-ink/70">
            {booking.booking_reference} · {members.operatorName} · {booking.contact_name}
            {members.guideProfileId ? " · guide assigned" : ""}
          </p>
          <Link href={backHref} className="mt-1 inline-block text-xs font-bold text-daet-forest underline">
            View booking
          </Link>
        </header>

        <ChatThread
          conversationId={conversation.id}
          viewerId={user.id}
          members={members}
          initialMessages={messages}
          initialAttachmentUrls={attachmentUrls}
          canSend={isMember && !closed}
          closedReason={closed ? "This booking was cancelled, so the chat is read-only." : !isMember ? "Admins can read this chat but not reply." : null}
        />
      </div>
    </PageFrame>
  );
}
