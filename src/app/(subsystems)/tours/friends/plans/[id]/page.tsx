import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageFrame } from "@/components/ui/page-frame";
import { SavedItinerary } from "@/components/tours/saved-itinerary";
import { BookEachTrip } from "@/components/planner/book-each-trip";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rowsToDays, type SavedItem } from "@/lib/tours/itinerary/form";
import { bookableForDays } from "@/lib/tours/itinerary/bookable";
import { isUuid } from "@/lib/tours/operator-access";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { canStartBooking } from "@/lib/tours/booking-eligibility";

export const metadata: Metadata = { title: "A friend's trip plan", robots: { index: false } };

type FriendPlan = { title: string; start_date: string | null; summary: string | null; owner: string; items: SavedItem[] };

/** A plan a friend shared with you: view only. Others get a 404. */
export default async function FriendPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isSupabaseConfigured() || !isUuid(id)) notFound();
  const session = await getAuthenticatedSession();
  if (!session.user) redirect(`/login?next=${encodeURIComponent(`/tours/friends/plans/${id}`)}`);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("tours_friend_itinerary", { p_itinerary: id });
  const plan = data as FriendPlan | null;
  if (!plan) notFound();

  const days = rowsToDays(plan.items ?? [], plan.start_date);
  const tours = await bookableForDays(supabase, days);
  const canBook = canStartBooking(session);

  return (
    <PageFrame>
      <div className="mx-auto max-w-3xl">
        <Link href="/tours/friends" className="inline-flex min-h-11 items-center text-sm font-bold text-daet-forest hover:underline dark:text-blue-300">
          ← Friends
        </Link>
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Shared by {plan.owner} · view only</p>
        <h1 className="display-2 mt-1 text-daet-ink">{plan.title}</h1>
        {plan.summary ? <p className="mt-3 rounded-2xl card-edge bg-surface p-4 text-base leading-7 text-daet-ink">{plan.summary}</p> : null}
        <div className="mt-6">
          <SavedItinerary days={days} />
        </div>
        {tours.length ? (
          <div className="mt-6 space-y-2">
            <BookEachTrip packages={tours} group={null} title={canBook ? "Book these tours yourself" : "Tour options"} canBook={canBook} />
            <p className="text-sm text-slate-600 dark:text-slate-400">Each tour is booked and paid separately, by each person or group.</p>
          </div>
        ) : null}
      </div>
    </PageFrame>
  );
}
