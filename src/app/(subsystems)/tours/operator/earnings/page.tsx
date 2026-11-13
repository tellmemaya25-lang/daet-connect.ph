import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { MoneyEarningsView, RangePicker } from "@/components/tours/earnings-view";
import { parseAnalyticsRange } from "@/lib/tours/dashboards";
import { parseMoneyEarnings } from "@/lib/tours/earnings";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";

export const metadata = { title: "Earnings" };

export default async function OperatorEarningsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getAuthenticatedSession();
  if (!session.user) redirect(`/login?next=${encodeURIComponent("/tours/operator/earnings")}`);
  if (session.role === "admin") redirect("/tours/admin/earnings");
  if (session.role === "guide") redirect("/tours/guide/earnings");
  if (session.role !== "operator") redirect("/dashboard");

  const today = toManilaDateKey(new Date());
  const range = parseAnalyticsRange(await searchParams, today);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("tours_earnings", { p_from: range.from, p_to: range.to });

  return (
    <PageFrame>
      <Link href="/tours/operator/payments" className="inline-flex min-h-11 items-center text-sm font-bold text-daet-forest hover:underline dark:text-blue-300">
        ← Revenue &amp; payments
      </Link>
      <h1 className="display-2 mb-4 text-daet-ink">Earnings</h1>
      <RangePicker path="/tours/operator/earnings" range={range} today={today} />
      {error ? (
        <Notice variant="error" title="Earnings could not be loaded">
          Please try again in a moment.
        </Notice>
      ) : (
        <MoneyEarningsView data={parseMoneyEarnings(data)} perOperator={false} />
      )}
    </PageFrame>
  );
}
