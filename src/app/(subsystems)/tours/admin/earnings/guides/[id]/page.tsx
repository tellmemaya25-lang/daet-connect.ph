import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPage } from "@/components/admin/admin-page";
import { RangePicker, Stat } from "@/components/tours/earnings-view";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { Notice } from "@/components/ui/notice";
import { formatPeso } from "@/lib/money";
import { parseAnalyticsRange } from "@/lib/tours/dashboards";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { isUuid } from "@/lib/tours/operator-access";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";

export const metadata = { title: "Guide earnings" };

const day = (key: string) => new Date(`${key}T00:00:00+08:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });

type Row = {
  id: string;
  booking_reference: string;
  tour_date: string;
  number_of_pax: number;
  status: string;
  guide_fee: number | null;
  guide_fee_paid_at: string | null;
  tours_packages: { title: string; operator_id: string; tours_operators: { id: string; business_name: string } | null } | null;
};

/** One guide's pay for a range: earned, owed, paid and coming up, with the tours behind it. */
export default async function AdminGuideEarningsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const here = `/tours/admin/earnings/guides/${id}`;
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next={here} />;

  const today = toManilaDateKey(new Date());
  const range = parseAnalyticsRange(await searchParams, today);

  const { data: guide } = await admin.supabase.from("tours_guides").select("id, profile_id").eq("id", id).maybeSingle();
  if (!guide) notFound();
  const { data: profile } = await admin.supabase.from("profiles").select("full_name").eq("id", guide.profile_id).maybeSingle();
  const name = profile?.full_name || "Guide";

  const { data, error } = await admin.supabase
    .from("tours_bookings")
    .select("id, booking_reference, tour_date, number_of_pax, status, guide_fee, guide_fee_paid_at, tours_packages!inner(title, operator_id, tours_operators(id, business_name))")
    .eq("assigned_guide_id", id)
    .in("status", ["confirmed", "completed"])
    .gte("tour_date", range.from)
    .lte("tour_date", range.to)
    .order("tour_date", { ascending: false })
    .limit(500);
  const rows = (data ?? []) as unknown as Row[];

  const done = rows.filter((r) => r.status === "completed");
  const feeSum = (list: Row[]) => list.reduce((s, r) => s + (r.guide_fee ?? 0), 0);
  const earned = feeSum(done);
  const paid = feeSum(done.filter((r) => r.guide_fee_paid_at));
  const coming = feeSum(rows.filter((r) => r.status === "confirmed"));

  return (
    <AdminPage>
      <AdminPageHeading title={name} backHref="/tours/admin/earnings" backLabel="Earnings and revenue" />
      <RangePicker path={here} range={range} today={today} />
      {error ? (
        <Notice variant="error" title="Earnings could not be loaded">
          Please try again in a moment.
        </Notice>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
            <Stat label="Earned" value={formatPeso(earned)} note={`${done.length} completed tours`} />
            <Stat label="Paid" value={formatPeso(paid)} note="already paid out" />
            <Stat label="Owed" value={formatPeso(earned - paid)} note="completed, not yet paid" />
            <Stat label="Coming up" value={formatPeso(coming)} note="on confirmed tours" />
          </div>
          <section aria-label="Tours" className="min-w-0 rounded-2xl card-edge bg-surface p-5">
            <h2 className="text-lg font-bold text-daet-ink">Tours in this range</h2>
            {rows.length === 0 ? (
              <p className="mt-2 text-sm text-daet-ink/70">No guided tours in this range.</p>
            ) : (
              <div className="mt-3 overflow-x-auto" tabIndex={0} role="group" aria-label="Tours table">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      <th scope="col" className="py-2 pr-3">Date</th>
                      <th scope="col" className="py-2 pr-3">Tour</th>
                      <th scope="col" className="py-2 pr-3">Operator</th>
                      <th scope="col" className="py-2 pr-3">Status</th>
                      <th scope="col" className="py-2 pr-3 text-right">Fee</th>
                      <th scope="col" className="py-2 text-right">Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const op = r.tours_packages?.tours_operators;
                      return (
                        <tr key={r.id} className="border-b border-line/60">
                          <td className="whitespace-nowrap py-2 pr-3">{day(r.tour_date)}</td>
                          <td className="py-2 pr-3">
                            {r.tours_packages?.title} <span className="text-daet-ink/70">· {r.booking_reference}</span>
                          </td>
                          <td className="py-2 pr-3">
                            {op ? (
                              <Link href={`/tours/admin/earnings/operators/${op.id}`} className="font-bold text-blue-700 underline dark:text-blue-300">
                                {op.business_name}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-2 pr-3">{r.status === "completed" ? "Completed" : "Confirmed"}</td>
                          <td className="py-2 pr-3 text-right font-bold">{r.guide_fee === null ? "No fee set" : formatPeso(r.guide_fee)}</td>
                          <td className="py-2 text-right">{r.status !== "completed" || r.guide_fee === null ? "—" : r.guide_fee_paid_at ? "Paid" : "Owed"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </AdminPage>
  );
}
