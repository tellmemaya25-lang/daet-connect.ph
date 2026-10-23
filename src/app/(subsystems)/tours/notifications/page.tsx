import { redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { PushOptIn } from "@/components/tours/push-opt-in";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notificationIcon, safeNotificationLink, timeAgo, type NotificationRow } from "@/lib/tours/notifications";
import { MarkAllReadButton } from "./mark-all-read-button";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">Configure Supabase to see notifications.</Notice>
      </PageFrame>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/tours/notifications")}`);

  const { data, error } = await supabase
    .from("tours_notifications")
    .select("id, type, title, body, link, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as NotificationRow[];
  const hasUnread = rows.some((row) => !row.read_at);

  return (
    <PageFrame>
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-black text-daet-ink">Notifications</h1>
          {hasUnread ? <MarkAllReadButton /> : null}
        </div>

        <Card className="mt-6">
          <PushOptIn variant="settings" />
        </Card>

        {error ? (
          <Notice variant="error" className="mt-6">Notifications could not be loaded. Refresh to try again.</Notice>
        ) : rows.length === 0 ? (
          <p className="mt-6 rounded-3xl border border-daet-ink/10 bg-white p-8 text-center text-sm text-daet-ink/60">
            Nothing yet. Updates about bookings, payments and messages appear here.
          </p>
        ) : (
          <ul className="mt-6 divide-y divide-daet-ink/10 overflow-hidden rounded-3xl border border-daet-ink/10 bg-white shadow-sm">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={safeNotificationLink(row.link)}
                  className={`flex gap-3 p-4 transition hover:bg-daet-sand/40 ${row.read_at ? "" : "bg-daet-forest/5"}`}
                >
                  <span aria-hidden="true" className="text-xl">{notificationIcon(row.type)}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-daet-ink ${row.read_at ? "font-semibold" : "font-black"}`}>{row.title}</span>
                    {row.body ? <span className="block text-sm text-daet-ink/70">{row.body}</span> : null}
                    <span className="mt-1 block text-xs text-daet-ink/45">{timeAgo(row.created_at)}</span>
                  </span>
                  {!row.read_at ? <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-daet-coral" aria-label="Unread" /> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageFrame>
  );
}
