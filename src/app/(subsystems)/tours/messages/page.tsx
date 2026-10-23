import { redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dayLabel } from "@/lib/tours/messaging";

export const dynamic = "force-dynamic";

type InboxRow = {
  conversation_id: string;
  booking_reference: string;
  package_title: string | null;
  tour_date: string;
  tourist_name: string;
  last_message_at: string;
  last_message: string | null;
  last_sender_id: string | null;
  unread: number;
};

const tourDate = (dateKey: string) =>
  new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });

export default async function MessagesInboxPage() {
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

  const { data, error } = await supabase.rpc("tours_inbox");
  if (error) console.error("Inbox error:", error);
  const rows = (data ?? []) as InboxRow[];

  return (
    <PageFrame>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-black text-daet-ink">Messages</h1>
        <p className="mt-1 text-sm text-daet-ink/65">Chats about your bookings. Only the tourist, the operator and the assigned guide can read them.</p>

        {error ? (
          <Notice variant="error" className="mt-6">Messages could not be loaded. Refresh to try again.</Notice>
        ) : rows.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-daet-ink/10 bg-white p-8 text-center shadow-sm">
            <p className="text-lg font-black text-daet-ink">No conversations yet</p>
            <p className="mt-1 text-sm text-daet-ink/65">Open a booking and tap “Message” to start a chat.</p>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-daet-ink/10 overflow-hidden rounded-3xl border border-daet-ink/10 bg-white shadow-sm">
            {rows.map((row) => {
              const preview = row.last_message ?? (row.last_sender_id ? "📷 Photo" : "No messages yet");
              const mine = row.last_sender_id === user.id;
              return (
                <li key={row.conversation_id}>
                  <Link href={`/tours/messages/${row.conversation_id}`} className="flex min-h-11 items-start gap-3 p-4 transition hover:bg-daet-sand/40">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={`truncate text-daet-ink ${row.unread > 0 ? "font-black" : "font-bold"}`}>{row.package_title ?? "Tour booking"}</p>
                        <span className="shrink-0 text-xs text-daet-ink/55">{dayLabel(row.last_message_at)}</span>
                      </div>
                      <p className="text-xs text-daet-ink/55">
                        {row.booking_reference} · {tourDate(row.tour_date)} · {row.tourist_name}
                      </p>
                      <p className={`mt-1 truncate text-sm ${row.unread > 0 ? "font-semibold text-daet-ink" : "text-daet-ink/65"}`}>
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
