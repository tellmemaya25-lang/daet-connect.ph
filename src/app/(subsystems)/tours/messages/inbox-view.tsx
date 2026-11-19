import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Notice } from "@/components/ui/notice";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { timed } from "@/lib/server-timing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedSession, getAuthUser } from "@/lib/tours/server-auth";
import { OpenChatButton } from "./open-chat-button";
import { parseFriendLists } from "@/lib/tours/friends";
import { inboxFilters, isConversationKind, type InboxRow } from "@/lib/tours/messaging";
import { InboxList } from "./inbox-list";
import { LiveInbox } from "./live-inbox";

export type InboxProps = { searchParams: Promise<{ kind?: string }>; basePath?: string };

/** The inbox with its loading skeleton. `basePath` is where the filter links point (the admin shell has its own copy). */
export function InboxSection({ searchParams, basePath = "/tours/messages" }: InboxProps) {
  return (
    <Suspense fallback={<InboxSkeleton />}>
      <Inbox searchParams={searchParams} basePath={basePath} />
    </Suspense>
  );
}

function InboxSkeleton() {
  return (
    <div aria-busy="true" className="mt-6">
      <p role="status" className="sr-only">
        Loading your messages
      </p>
      <div aria-hidden="true" className="animate-pulse space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl card-edge bg-surface p-4">
            <div className="h-12 w-12 shrink-0 rounded-full bg-daet-ink/10" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-5 w-1/2 rounded-full bg-daet-ink/10" />
              <div className="h-4 w-3/4 rounded-full bg-daet-ink/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

async function Inbox({ searchParams, basePath = "/tours/messages" }: InboxProps) {
  if (!isSupabaseConfigured()) {
    return (
      <Notice variant="warning" title="Supabase setup needed" className="mt-6">Configure Supabase to use messages.</Notice>
    );
  }

  const user = await getAuthUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(basePath)}`);
  const supabase = await createSupabaseServerClient();

  const { kind: rawKind } = await searchParams;
  // The inbox and the role (only an admin gets the operator list) need only the
  // user, so they are asked for together.
  const [{ data, error }, session] = await Promise.all([
    timed("page:messages", async () => supabase.rpc("tours_chat_inbox")),
    getAuthenticatedSession(),
  ]);
  if (error) console.error("Inbox error:", error);
  const all = (data ?? []) as InboxRow[];
  // An admin, operator or guide reads the inbox inside their shell; the signed-in frame is for everyone else.
  if (basePath === "/tours/messages" && session.role === "admin") redirect(isConversationKind(rawKind) ? `/tours/admin/messages?kind=${rawKind}` : "/tours/admin/messages");
  if (basePath === "/tours/messages" && session.role === "operator") redirect(isConversationKind(rawKind) ? `/tours/operator/messages?kind=${rawKind}` : "/tours/operator/messages");
  if (basePath === "/tours/messages" && session.role === "guide") redirect(isConversationKind(rawKind) ? `/tours/guide/messages?kind=${rawKind}` : "/tours/guide/messages");
  const isTourist = session.role === "tourist";
  const filters = inboxFilters(all.map((row) => row.kind), { friendsTab: isTourist });
  const kind = isConversationKind(rawKind) && filters.some((f) => f.kind === rawKind) ? rawKind : null;
  const rows = kind ? all.filter((row) => row.kind === kind) : all;

  // Friends tab: friends without a chat yet, to start one.
  const chatted = new Set(all.filter((row) => row.kind === "friends").map((row) => row.other_profile_id));
  const friendsToMessage =
    kind === "friends" ? parseFriendLists((await supabase.rpc("tours_my_friends")).data).friends.filter((f) => !chatted.has(f.id)) : [];

  // The Tourism Office can start a chat with any operator.
  const isAdmin = session.role === "admin";
  const { data: operatorList } = isAdmin
    ? await supabase.from("tours_operators").select("id, business_name, accreditation_status").order("business_name").limit(200)
    : { data: null };

  return (
    <>
    {filters.length > 0 ? (
      <nav aria-label="Filter conversations" className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {filters.map((filter) => {
          const active = filter.kind === kind;
          return (
            <Link
              key={filter.label}
              href={filter.kind ? `${basePath}?kind=${filter.kind}` : basePath}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-[15px] font-bold transition active:scale-[0.98] ${active ? "bg-blue-600 text-white" : "bg-surface text-daet-ink hover:bg-blue-50 dark:hover:bg-blue-950/40"}`}
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>
    ) : null}

    {isAdmin ? (
      <details className="mt-4 rounded-2xl card-edge bg-surface p-4">
        <summary className="min-h-11 cursor-pointer content-center text-sm font-bold text-daet-forest dark:text-blue-300">Message an operator</summary>
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

    {kind === "friends" ? (
      <section aria-labelledby="message-a-friend" className="mt-4 rounded-2xl card-edge bg-surface p-4">
        <h2 id="message-a-friend" className="text-sm font-bold text-daet-ink">Message a friend</h2>
        {friendsToMessage.length ? (
          <ul className="mt-2 divide-y divide-daet-ink/10">
            {friendsToMessage.map((friend) => (
              <li key={friend.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-sm font-bold text-daet-ink">{friend.name}</span>
                <OpenChatButton target={{ kind: "friends", friendId: friend.id }} label="Message" variant="ghost" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-daet-ink/70">
            {chatted.size ? "You have a chat with every friend below." : "No friends yet."}{" "}
            <Link href="/tours/friends" className="font-bold text-blue-700 underline dark:text-blue-300">
              Find friends
            </Link>
          </p>
        )}
      </section>
    ) : null}

    {error ? <Notice variant="error" className="mt-6">Messages could not be loaded. Refresh to try again.</Notice> : null}
    <div className="mt-6">
      <LiveInbox viewerId={user.id}>
        <InboxList rows={rows} viewerId={user.id} />
      </LiveInbox>
    </div>
    </>
  );
}
