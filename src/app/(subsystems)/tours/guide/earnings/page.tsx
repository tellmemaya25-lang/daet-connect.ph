import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { GuideEarningsView, RangePicker } from "@/components/tours/earnings-view";
import { parseAnalyticsRange } from "@/lib/tours/dashboards";
import { parseGuideEarnings } from "@/lib/tours/earnings";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { addDays } from "@/lib/tours/itinerary/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";

export const metadata = { title: "My earnings" };

export default async function GuideEarningsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getAuthenticatedSession();
  if (!session.user) redirect(`/login?next=${encodeURIComponent("/tours/guide/earnings")}`);
  if (session.role === "admin") redirect("/tours/admin/earnings");
  if (session.role === "operator") redirect("/tours/operator/earnings");
  if (session.role !== "guide") redirect("/dashboard");

  const today = toManilaDateKey(new Date());
  const range = parseAnalyticsRange(await searchParams, today);
  const supabase = await createSupabaseServerClient();
  const [past, upcoming] = await Promise.all([
    supabase.rpc("tours_earnings", { p_from: range.from, p_to: range.to }),
    supabase.rpc("tours_earnings", { p_from: addDays(today, 1), p_to: addDays(today, 60) }),
  ]);

  return (
    <PageFrame>
      <Link href="/tours/guide/dashboard" className="inline-flex min-h-11 items-center text-sm font-bold text-daet-forest hover:underline dark:text-blue-300">
        ← Dashboard
      </Link>
      <h1 className="display-2 mb-4 text-daet-ink">My earnings</h1>
      <RangePicker path="/tours/guide/earnings" range={range} today={today} />
      {past.error || upcoming.error ? (
        <Notice variant="error" title="Earnings could not be loaded">
          Please try again in a moment.
        </Notice>
      ) : (
        <GuideEarningsView past={parseGuideEarnings(past.data)} upcoming={parseGuideEarnings(upcoming.data)} />
      )}
    </PageFrame>
  );
}
