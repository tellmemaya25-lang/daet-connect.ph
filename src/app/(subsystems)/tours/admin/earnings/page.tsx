import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { MoneyEarningsView, RangePicker } from "@/components/tours/earnings-view";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { parseAnalyticsRange } from "@/lib/tours/dashboards";
import { parseMoneyEarnings } from "@/lib/tours/earnings";
import { parseAdminRevenue } from "@/lib/tours/admin-moderation";
import { AdminRevenueView } from "@/components/tours/admin-revenue-view";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";

export const metadata = { title: "Earnings and revenue" };

export default async function AdminEarningsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next="/tours/admin/earnings" />;

  const today = toManilaDateKey(new Date());
  const range = parseAnalyticsRange(await searchParams, today);
  const [{ data, error }, revenue] = await Promise.all([
    admin.supabase.rpc("tours_earnings", { p_from: range.from, p_to: range.to }),
    admin.supabase.rpc("tours_admin_revenue", { p_from: range.from, p_to: range.to }),
  ]);

  return (
    <PageFrame adminNav>
      <AdminPageHeading title="Earnings and revenue" backHref="/tours/admin" backLabel="Admin dashboard" />
      <RangePicker path="/tours/admin/earnings" range={range} today={today} />
      {error ? (
        <Notice variant="error" title="Earnings could not be loaded">
          Please try again in a moment.
        </Notice>
      ) : (
        <>
          {revenue.error ? null : <AdminRevenueView data={parseAdminRevenue(revenue.data)} />}
          <h2 className="mb-3 text-xl font-bold text-daet-ink">By operator and guide</h2>
          <MoneyEarningsView data={parseMoneyEarnings(data)} perOperator />
        </>
      )}
    </PageFrame>
  );
}
