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

export const metadata = { title: "Operator earnings" };

const day = (key: string) => new Date(`${key}T00:00:00+08:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
const sum = (rows: { v: number | null }[]) => rows.reduce((s, r) => s + (r.v ?? 0), 0);

type Row = {
  id: string;
  booking_reference: string;
  tour_date: string;
  number_of_pax: number;
  status: string;
  total_amount: number;
  guide_fee: number | null;
  assigned_guide_id: string | null;
  tours_packages: { title: string; operator_id: string } | null;
};

/** One operator's money for a range: what the admin sees in the By operator table, with the bookings behind it. */
export default async function AdminOperatorEarningsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const here = `/tours/admin/earnings/operators/${id}`;
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next={here} />;

  const today = toManilaDateKey(new Date());
  const range = parseAnalyticsRange(await searchParams, today);
  const start = new Date(`${range.from}T00:00:00+08:00`).toISOString();
  const end = new Date(new Date(`${range.to}T00:00:00+08:00`).getTime() + 86400000).toISOString();

  const { data: op } = await admin.supabase.from("tours_operators").select("id, business_name").eq("id", id).maybeSingle();
  if (!op) notFound();

  const [bookingsRes, paymentsRes] = await Promise.all([
    admin.supabase
      .from("tours_bookings")
      .select("id, booking_reference, tour_date, number_of_pax, status, total_amount, guide_fee, assigned_guide_id, tours_packages!inner(title, operator_id)")
      .eq("tours_packages.operator_id", id)
      .in("status", ["confirmed", "completed"])
      .gte("tour_date", range.from)
      .lte("tour_date", range.to)
      .order("tour_date", { ascending: false })
      .limit(500),
    admin.supabase
      .from("tours_payments")
      .select("amount, payment_status, tours_bookings!inner(tours_packages!inner(operator_id))")
      .eq("tours_bookings.tours_packages.operator_id", id)
      .in("payment_status", ["completed", "refunded"])
      .gte("payment_date", start)
      .lt("payment_date", end)
      .limit(2000),
  ]);
  const failed = bookingsRes.error || paymentsRes.error;
  const rows = (bookingsRes.data ?? []) as unknown as Row[];
  const pays = (paymentsRes.data ?? []) as { amount: number; payment_status: string }[];

  const booked = sum(rows.map((r) => ({ v: r.total_amount })));
  const collected = sum(pays.filter((p) => p.payment_status === "completed").map((p) => ({ v: p.amount })));
  const refunded = sum(pays.filter((p) => p.payment_status === "refunded").map((p) => ({ v: p.amount })));
  const guideFees = sum(rows.filter((r) => r.status === "completed").map((r) => ({ v: r.guide_fee })));

  return (
    <AdminPage>
      <AdminPageHeading title={op.business_name} backHref="/tours/admin/earnings" backLabel="Earnings and revenue" />
      <RangePicker path={here} range={range} today={today} />
      {failed ? (
        <Notice variant="error" title="Earnings could not be loaded">
          Please try again in a moment.
        </Notice>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
            <Stat label="Booked" value={formatPeso(booked)} note={`${rows.length} confirmed or completed`} />
            <Stat label="Collected" value={formatPeso(collected)} note={refunded ? `${formatPeso(refunded)} refunded` : "payments received"} />
            <Stat label="Guide fees" value={formatPeso(guideFees)} note="owed on completed tours" />
            <Stat label="Net revenue" value={formatPeso(collected - refunded - guideFees)} note="collected − refunds − guide fees" />
          </div>
          <section aria-label="Bookings" className="min-w-0 rounded-2xl card-edge bg-surface p-5">
            <h2 className="text-lg font-bold text-daet-ink">Bookings in this range</h2>
            {rows.length === 0 ? (
              <p className="mt-2 text-sm text-daet-ink/70">No confirmed or completed bookings in this range.</p>
            ) : (
              <div className="mt-3 overflow-x-auto" tabIndex={0} role="group" aria-label="Bookings table">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      <th scope="col" className="py-2 pr-3">Date</th>
                      <th scope="col" className="py-2 pr-3">Tour</th>
                      <th scope="col" className="py-2 pr-3 text-right">Guests</th>
                      <th scope="col" className="py-2 pr-3">Status</th>
                      <th scope="col" className="py-2 pr-3 text-right">Total</th>
                      <th scope="col" className="py-2 text-right">Guide fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-line/60">
                        <td className="whitespace-nowrap py-2 pr-3">{day(r.tour_date)}</td>
                        <td className="py-2 pr-3">
                          {r.tours_packages?.title} <span className="text-daet-ink/70">· {r.booking_reference}</span>
                        </td>
                        <td className="py-2 pr-3 text-right">{r.number_of_pax}</td>
                        <td className="py-2 pr-3">{r.status === "completed" ? "Completed" : "Confirmed"}</td>
                        <td className="py-2 pr-3 text-right">{formatPeso(r.total_amount)}</td>
                        <td className="py-2 text-right">
                          {r.assigned_guide_id ? (
                            <Link href={`/tours/admin/earnings/guides/${r.assigned_guide_id}`} className="font-bold text-blue-700 underline dark:text-blue-300">
                              {r.guide_fee === null ? "No fee set" : formatPeso(r.guide_fee)}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
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
