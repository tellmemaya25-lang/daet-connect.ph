import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { MoneyEarningsView, RangePicker } from "@/components/tours/earnings-view";
import { parseAnalyticsRange } from "@/lib/tours/dashboards";
import { parseMoneyEarnings, type GuideFeeRow } from "@/lib/tours/earnings";
import { GuideFeesPanel } from "./guide-fees-panel";
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
  const [{ data, error }, fees, stats] = await Promise.all([
    supabase.rpc("tours_earnings", { p_from: range.from, p_to: range.to }),
    supabase
      .from("tours_bookings")
      .select("id, booking_reference, tour_date, guide_fee, guide_fee_paid_at, assigned_guide_id, tours_packages!inner ( title, operator_id )")
      .eq("status", "completed")
      .not("assigned_guide_id", "is", null)
      .not("guide_fee", "is", null)
      .gte("tour_date", range.from)
      .lte("tour_date", range.to)
      .order("tour_date", { ascending: false })
      .limit(200),
    supabase.rpc("tours_operator_guide_stats", { p_from: range.from, p_to: range.to }),
  ]);
  const names = new Map<string, string>();
  for (const g of ((stats.data as { guides?: unknown } | null)?.guides as Array<{ id?: unknown; name?: unknown }> | undefined) ?? [])
    if (typeof g.id === "string") names.set(g.id, typeof g.name === "string" ? g.name : "Guide");
  const feeRows: GuideFeeRow[] = ((fees.data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => {
    const pkg = (Array.isArray(r.tours_packages) ? r.tours_packages[0] : r.tours_packages) as { title?: string } | null;
    return {
      id: String(r.id),
      reference: String(r.booking_reference ?? ""),
      date: String(r.tour_date ?? ""),
      title: pkg?.title ?? "Tour",
      guide: names.get(String(r.assigned_guide_id)) ?? "Guide",
      fee: Number(r.guide_fee) || 0,
      paidAt: typeof r.guide_fee_paid_at === "string" ? r.guide_fee_paid_at : null,
    };
  });

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
      {fees.error ? null : <GuideFeesPanel key={`${range.from}:${range.to}`} rows={feeRows} />}
    </PageFrame>
  );
}
