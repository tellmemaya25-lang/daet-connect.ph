import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { PushOptIn } from "@/components/tours/push-opt-in";
import { checkPayable, remainingBalance } from "@/lib/paymongo/checkout";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "My trips" };

const PAYMENT: Record<string, { label: string; tone: BadgeTone }> = {
  unpaid: { label: "Unpaid", tone: "warning" },
  partial: { label: "Partially paid", tone: "info" },
  paid: { label: "Paid", tone: "success" },
  refunded: { label: "Refunded", tone: "neutral" },
};
const peso = (value: number) => `₱${value.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
const longDate = (key: string) => new Date(`${key}T00:00:00+08:00`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "Asia/Manila" });

type BookingRow = {
  id: string;
  booking_reference: string;
  tour_date: string;
  status: string;
  number_of_pax: number;
  total_amount: number;
  total_paid: number | null;
  payment_status: string | null;
  tours_packages: { title: string; location_name: string } | { title: string; location_name: string }[] | null;
};

export default async function TouristDashboardPage() {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">Configure Supabase to see your trips.</Notice>
      </PageFrame>
    );
  }
  const session = await getAuthenticatedSession();
  if (!session.user) redirect(`/login?next=${encodeURIComponent("/tours/me")}`);
  // Staff have their own dashboards.
  if (session.role && session.role !== "tourist") redirect(session.role === "admin" ? "/tours/admin" : "/dashboard");

  const supabase = await createSupabaseServerClient();
  const today = toManilaDateKey(new Date());
  const [{ data: bookingRows }, { data: itineraries }, { data: inbox }, { data: profile }] = await Promise.all([
    supabase
      .from("tours_bookings")
      .select("id, booking_reference, tour_date, status, number_of_pax, total_amount, total_paid, payment_status, tours_packages ( title, location_name )")
      .eq("user_id", session.user.id)
      .order("tour_date", { ascending: true })
      .limit(200),
    supabase
      .from("tours_itineraries")
      .select("id, title, start_date, end_date, tours_itinerary_items ( id )")
      .eq("tourist_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase.rpc("tours_inbox"),
    supabase.from("profiles").select("full_name").eq("id", session.user.id).maybeSingle(),
  ]);

  const bookings = (bookingRows ?? []) as unknown as BookingRow[];
  const upcoming = bookings.filter((b) => (b.status === "pending" || b.status === "confirmed") && b.tour_date >= today);
  const completed = bookings.filter((b) => b.status === "completed");
  const { data: reviewed } = completed.length
    ? await supabase.from("tours_reviews").select("booking_id").in("booking_id", completed.map((b) => b.id))
    : { data: [] as { booking_id: string }[] };
  const reviewedIds = new Set((reviewed ?? []).map((r) => r.booking_id));
  const toReview = completed.filter((b) => !reviewedIds.has(b.id)).reverse().slice(0, 3);
  const unreadChats = ((inbox ?? []) as Array<{ unread: number }>).reduce((sum, row) => sum + Number(row.unread ?? 0), 0);
  const firstName = profile?.full_name?.split(" ")[0];
  const pkgOf = (b: BookingRow) => (Array.isArray(b.tours_packages) ? b.tours_packages[0] : b.tours_packages);

  return (
    <PageFrame>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-daet-leaf">My trips</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-daet-ink">{firstName ? `Mabuhay, ${firstName}!` : "Mabuhay!"}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/tours/browse">Find a tour</ButtonLink>
          <ButtonLink href="/tours/plan" variant="secondary">Plan a trip</ButtonLink>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader eyebrow="Coming up" title="Upcoming tours" action={<Link href="/tours/my-bookings" className="text-sm font-bold text-daet-forest hover:underline">All bookings</Link>} />
            {upcoming.length === 0 ? (
              <EmptyState icon="🏝️" title="No upcoming tours" description="Book a tour and it will show up here with your ticket." action={<ButtonLink href="/tours/browse">Browse tours</ButtonLink>} />
            ) : (
              <ul className="divide-y divide-daet-ink/10">
                {upcoming.map((b) => {
                  const pkg = pkgOf(b);
                  const pay = PAYMENT[b.payment_status ?? "unpaid"] ?? PAYMENT.unpaid;
                  const balance = remainingBalance(b);
                  const payable = checkPayable(b).ok;
                  return (
                    <li key={b.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link href={`/tours/bookings/${b.id}`} className="font-black text-daet-ink hover:underline">
                            {pkg?.title ?? "Tour"}
                          </Link>
                          <p className="text-sm text-daet-ink/60">
                            {b.tour_date === today ? <strong className="text-daet-forest">Today</strong> : longDate(b.tour_date)} · {b.number_of_pax} pax · {pkg?.location_name}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge tone={b.status === "confirmed" ? "success" : "warning"}>{b.status === "confirmed" ? "Confirmed" : "Waiting for operator"}</Badge>
                          <Badge tone={pay.tone}>{pay.label}</Badge>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {b.status === "confirmed" ? (
                          <ButtonLink href={`/tours/bookings/${b.id}/ticket`} size="md">
                            Show ticket QR
                          </ButtonLink>
                        ) : null}
                        {payable && balance > 0 ? (
                          <ButtonLink href={`/tours/bookings/${b.id}#payment`} variant="accent">
                            Pay {peso(balance)}
                          </ButtonLink>
                        ) : null}
                        <ButtonLink href={`/tours/bookings/${b.id}`} variant="ghost">
                          Details
                        </ButtonLink>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {toReview.length > 0 ? (
            <Card>
              <CardHeader eyebrow="Your feedback helps" title="Rate your recent tours" />
              <ul className="space-y-3">
                {toReview.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-daet-sand/40 p-3">
                    <span className="min-w-0">
                      <span className="block font-bold text-daet-ink">{pkgOf(b)?.title ?? "Tour"}</span>
                      <span className="text-xs text-daet-ink/60">{longDate(b.tour_date)}</span>
                    </span>
                    <ButtonLink href={`/tours/bookings/${b.id}#review`} variant="secondary">
                      ★ Write a review
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Messages" />
            <p className="text-sm text-daet-ink/70">
              {unreadChats > 0 ? (
                <>
                  You have <strong className="text-daet-ink">{unreadChats} unread</strong> message{unreadChats === 1 ? "" : "s"} from operators and guides.
                </>
              ) : (
                "No unread messages."
              )}
            </p>
            <ButtonLink href="/tours/messages" variant="secondary" className="mt-3">
              Open inbox
            </ButtonLink>
          </Card>

          <Card>
            <CardHeader title="Saved trip plans" action={<Link href="/tours/my-itineraries" className="text-sm font-bold text-daet-forest hover:underline">All</Link>} />
            {(itineraries ?? []).length === 0 ? (
              <p className="text-sm text-daet-ink/60">
                Plan a trip around Daet and save it here. <Link href="/tours/plan" className="font-bold text-daet-forest underline">Start planning</Link>
              </p>
            ) : (
              <ul className="space-y-2">
                {(itineraries ?? []).map((it) => (
                  <li key={it.id}>
                    <Link href={`/tours/my-itineraries/${it.id}`} className="block rounded-xl p-2 hover:bg-daet-sand/50">
                      <span className="block font-bold text-daet-ink">{it.title}</span>
                      <span className="text-xs text-daet-ink/60">
                        {it.start_date ? longDate(it.start_date) : "No date"} · {it.tours_itinerary_items?.length ?? 0} stops
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <PushOptIn variant="prompt" />
        </div>
      </div>
    </PageFrame>
  );
}
