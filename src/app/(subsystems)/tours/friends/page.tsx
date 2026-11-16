import Link from "next/link";
import { redirect } from "next/navigation";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { SearchBox } from "@/components/ui/search-box";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cleanSearch, initials, parseFoundPeople, parseFriendLists, parseSharedPlans, type Person } from "@/lib/tours/friends";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { answerFriendRequest, removeFriend, sendFriendRequest } from "./actions";

export const metadata = { title: "Friends" };

const day = (key: string | null) => (key ? new Date(`${key}T00:00:00+08:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }) : null);

function Face({ person }: { person: Person }) {
  return person.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={person.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
  ) : (
    <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-daet-ink">
      {initials(person.name)}
    </span>
  );
}

function PersonRow({ person, children }: { person: Person; children?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <span className="flex min-w-0 items-center gap-3">
        <Face person={person} />
        <span className="truncate font-bold text-daet-ink">{person.name}</span>
      </span>
      <span className="flex flex-wrap gap-2">{children}</span>
    </li>
  );
}

function Act({ action, label, variant = "primary" }: { action: () => Promise<void>; label: string; variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <form action={action}>
      <Button type="submit" variant={variant}>
        {label}
      </Button>
    </form>
  );
}

/**
 * Friends (tourists): find people by email or name, answer requests, and see
 * the plans friends shared. Server-rendered on each visit; the search runs
 * when the form is sent, never per keystroke, and nothing polls.
 */
export default async function FriendsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getAuthenticatedSession();
  if (!session.user) redirect(`/login?next=${encodeURIComponent("/tours/friends")}`);
  if (session.role !== "tourist") redirect("/dashboard");
  const params = await searchParams;
  const q = cleanSearch(Array.isArray(params.q) ? params.q[0] : params.q);

  if (!isSupabaseConfigured()) return <PageFrame><Notice variant="error">Friends are unavailable right now.</Notice></PageFrame>;
  const supabase = await createSupabaseServerClient();
  const [lists, shared, found] = await Promise.all([
    supabase.rpc("tours_my_friends"),
    supabase.rpc("tours_itineraries_shared_with_me"),
    q ? supabase.rpc("tours_find_people", { p_query: q }) : Promise.resolve({ data: [], error: null }),
  ]);
  const { friends, incoming, outgoing } = parseFriendLists(lists.data);
  const plans = parseSharedPlans(shared.data);
  const people = parseFoundPeople(found.data);

  return (
    <PageFrame>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="display-2 text-daet-ink">Friends</h1>
          <p className="mt-1 text-daet-ink/70">Add friends to share your trip plans with them. Only friends you choose see a plan.</p>
        </div>
        {lists.error ? <Notice variant="error" title="Friends could not be loaded">Please try again in a moment.</Notice> : null}

        <section aria-labelledby="find-title" className="rounded-2xl card-edge bg-surface p-5">
          <h2 id="find-title" className="text-lg font-bold text-daet-ink">Find friends</h2>
          <p className="mb-3 text-sm text-daet-ink/70">Search by their name, or their exact email address. Emails are never shown.</p>
          <SearchBox action="/tours/friends" label="Find friends" placeholder="Name or email" value={q} />
          {q ? (
            people.length ? (
              <ul aria-label="Search results" className="mt-3 divide-y divide-line">
                {people.map((p) => (
                  <PersonRow key={p.id} person={p}>
                    {p.status === "friends" ? <span className="text-sm font-bold text-green-800 dark:text-green-300">Friends</span> : null}
                    {p.status === "requested" ? <span className="text-sm text-daet-ink/70">Request sent</span> : null}
                    {p.status === "incoming" ? <Act action={answerFriendRequest.bind(null, p.id, true)} label="Accept" /> : null}
                    {p.status === "none" ? <Act action={sendFriendRequest.bind(null, p.id)} label="Add friend" /> : null}
                  </PersonRow>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-daet-ink/70">No travellers found for “{q}”.</p>
            )
          ) : null}
        </section>

        {incoming.length ? (
          <section aria-labelledby="requests-title" className="rounded-2xl card-edge bg-surface p-5">
            <h2 id="requests-title" className="text-lg font-bold text-daet-ink">Friend requests</h2>
            <ul className="divide-y divide-line">
              {incoming.map((p) => (
                <PersonRow key={p.id} person={p}>
                  <Act action={answerFriendRequest.bind(null, p.id, true)} label="Accept" />
                  <Act action={answerFriendRequest.bind(null, p.id, false)} label="Decline" variant="ghost" />
                </PersonRow>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="friends-title" className="rounded-2xl card-edge bg-surface p-5">
          <h2 id="friends-title" className="text-lg font-bold text-daet-ink">Your friends ({friends.length})</h2>
          {friends.length ? (
            <ul className="divide-y divide-line">
              {friends.map((p) => (
                <PersonRow key={p.id} person={p}>
                  <Act action={removeFriend.bind(null, p.id)} label="Remove" variant="ghost" />
                </PersonRow>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-daet-ink/70">No friends yet. Find someone above.</p>
          )}
          {outgoing.length ? (
            <>
              <h3 className="mt-4 text-sm font-bold text-daet-ink">Waiting for an answer</h3>
              <ul className="divide-y divide-line">
                {outgoing.map((p) => (
                  <PersonRow key={p.id} person={p}>
                    <Act action={removeFriend.bind(null, p.id)} label="Cancel request" variant="ghost" />
                  </PersonRow>
                ))}
              </ul>
            </>
          ) : null}
        </section>

        <section aria-labelledby="plans-title" className="rounded-2xl card-edge bg-surface p-5">
          <h2 id="plans-title" className="text-lg font-bold text-daet-ink">Plans shared with you</h2>
          {plans.length ? (
            <ul className="divide-y divide-line">
              {plans.map((plan) => (
                <li key={plan.id} className="py-3">
                  <Link href={`/tours/friends/plans/${plan.id}`} className="font-bold text-daet-forest hover:underline dark:text-blue-300">
                    {plan.title}
                  </Link>
                  <p className="text-sm text-daet-ink/70">
                    From {plan.owner}
                    {plan.startDate ? ` · ${day(plan.startDate)}${plan.endDate && plan.endDate !== plan.startDate ? ` – ${day(plan.endDate)}` : ""}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-daet-ink/70">When a friend shares a trip plan with you, it shows here.</p>
          )}
        </section>
      </div>
    </PageFrame>
  );
}
