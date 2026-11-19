import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RangePicker, Stat } from "@/components/tours/earnings-view";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { formatPeso } from "@/lib/money";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseAnalyticsRange } from "@/lib/tours/dashboards";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { isUuid } from "@/lib/tours/operator-access";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";

export const metadata = { title: "Guide earnings" };

const day = (key: string) => new Date(`${key}T00:00:00+08:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });

type Row = {
  id: string;
  booking_reference: string;
  tour_date: string;
  status: string;
  guide_fee: number | null;
  guide_fee_paid_at: string | null;
  tours_packages: { title: string } | null;
};

/** One guide on the operator's team: what the operator owes, has paid and will owe, with the tours behind it. */
export default async function OperatorGuideEarningsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const here = `/tours/operator/guides/${id}`;
  const session = await getAuthenticatedSession();
  if (!session.user) redirect(`/login?next=${encodeURIComponent(here)}`);
  if (session.role !== "operator") redirect("/dashboard");

  const supabase = await createSupabaseServerClient();
  const { data: operator } = await supabase.from("tours_operators").select("id").eq("profile_id", session.user.id).maybeSingle();
  if (!operator) redirect("/tours/operator/register");

  // Only a guide who has worked with this operator has a page here.
  const { data: link } = await supabase.from("tours_guide_applications").select("id").eq("operator_id", operator.id).eq("guide_id", id).eq("status", "active").maybeSingle();
  if (!link) notFound();
  const { data: guide } = await supabase.from("tours_guides").select("profile_id").eq("id", id).maybeSingle();
  const { data: profile } = guide ? await supabase.from("profiles").select("full_name").eq("id", guide.profile_id).maybeSingle() : { data: null };
  const name = profile?.full_name?.trim() || "Guide";

  const today = toManilaDateKey(new Date());
  const range = parseAnalyticsRange(await searchParams, today);
  const { data, error } = await supabase
    .from("tours_bookings")
    .select("id, booking_reference, tour_date, status, guide_fee, guide_fee_paid_at, tours_packages!inner(title, operator_id)")
    .eq("assigned_guide_id", id)
    .eq("tours_packages.operator_id", operator.id)
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
    <PageFrame>
      <Link href="/tours/operator/guides" className="inline-flex min-h-11 items-center text-sm font-bold text-daet-forest hover:underline dark:text-blue-300">
        ← Guides
      </Link>
      <h1 className="display-2 mb-4 text-daet-ink [overflow-wrap:anywhere]">{name}</h1>
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
            <Stat label="You owe" value={formatPeso(earned - paid)} note="completed, not yet paid" />
            <Stat label="Coming up" value={formatPeso(coming)} note="on confirmed tours" />
          </div>
          <section aria-label="Tours" className="min-w-0 rounded-2xl card-edge bg-surface p-5">
            <h2 className="text-lg font-bold text-daet-ink">Tours in this range</h2>
            {rows.length === 0 ? (
              <p className="mt-2 text-sm text-daet-ink/70">No guided tours in this range.</p>
            ) : (
              <div className="mt-3 overflow-x-auto" tabIndex={0} role="group" aria-label="Tours table">
                <table className="w-full min-w-[32rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      <th scope="col" className="py-2 pr-3">Date</th>
                      <th scope="col" className="py-2 pr-3">Tour</th>
                      <th scope="col" className="py-2 pr-3">Status</th>
                      <th scope="col" className="py-2 pr-3 text-right">Fee</th>
                      <th scope="col" className="py-2 text-right">Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-line/60">
                        <td className="whitespace-nowrap py-2 pr-3">{day(r.tour_date)}</td>
                        <td className="py-2 pr-3">
                          {r.tours_packages?.title} <span className="text-daet-ink/70">· {r.booking_reference}</span>
                        </td>
                        <td className="py-2 pr-3">{r.status === "completed" ? "Completed" : "Confirmed"}</td>
                        <td className="py-2 pr-3 text-right font-bold">{r.guide_fee === null ? "No fee set" : formatPeso(r.guide_fee)}</td>
                        <td className="py-2 text-right">{r.status !== "completed" || r.guide_fee === null ? "—" : r.guide_fee_paid_at ? "Paid" : "Owed"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </PageFrame>
  );
}
