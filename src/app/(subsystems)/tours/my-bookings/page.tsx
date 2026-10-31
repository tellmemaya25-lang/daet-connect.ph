import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LineIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { formatPeso } from "@/lib/money";
import { PHOTOS } from "@/lib/photo-credits";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { placePhoto } from "@/lib/tours/trip-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "My bookings" };

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Waiting for operator", tone: "warning" },
  confirmed: { label: "Confirmed", tone: "success" },
  completed: { label: "Completed", tone: "info" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  rejected: { label: "Declined", tone: "danger" },
};

const PAYMENT: Record<string, { label: string; tone: BadgeTone }> = {
  unpaid: { label: "Unpaid", tone: "warning" },
  partial: { label: "Partially paid", tone: "info" },
  paid: { label: "Paid", tone: "success" },
  refunded: { label: "Refunded", tone: "neutral" },
};

type Pkg = { id: string; title: string; location_name: string | null; cover_image_url: string | null };
type Row = {
  id: string;
  booking_reference: string;
  tour_date: string;
  status: string;
  number_of_pax: number;
  total_amount: number;
  payment_status: string | null;
  tours_packages: Pkg | Pkg[] | null;
};

const PAST_SHOWN = 3;

const owesPayment = (b: Row) => b.status === "confirmed" && b.payment_status !== "paid" && b.payment_status !== "refunded";

const dayKeyToUtc = (key: string) => Date.parse(`${key}T00:00:00Z`);

/** "Today", "Tomorrow" or "In 12 days" for an upcoming date; null once it is further out than a month. */
function daysAway(key: string, today: string): string | null {
  const days = Math.round((dayKeyToUtc(key) - dayKeyToUtc(today)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return days > 1 && days <= 31 ? `In ${days} days` : null;
}

const longDate = (key: string) =>
  new Date(`${key}T00:00:00+08:00`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });

export default async function MyBookingsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">
          Configure Supabase to view bookings.
        </Notice>
      </PageFrame>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/tours/my-bookings")}`);

  const { data, error } = await supabase
    .from("tours_bookings")
    .select("id, booking_reference, tour_date, status, number_of_pax, total_amount, payment_status, tours_packages ( id, title, location_name, cover_image_url )")
    .eq("user_id", user.id)
    .order("tour_date", { ascending: true });
  if (error) console.error("Bookings fetch error:", error.message);

  const rows = (data ?? []) as Row[];
  const today = toManilaDateKey(new Date());
  const isActive = (b: Row) => (b.status === "pending" || b.status === "confirmed") && b.tour_date >= today;
  const upcoming = rows.filter(isActive);
  const past = rows.filter((b) => !isActive(b)).reverse();
  const owing = upcoming.filter(owesPayment);
  const owingAll = owing.every((b) => (b.payment_status ?? "unpaid") === "unpaid");
  const owingTotal = owing.reduce((sum, b) => sum + Number(b.total_amount ?? 0), 0);

  return (
    <PageFrame>
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="display-2 text-daet-ink">My bookings</h1>
            <p className="mt-2 text-lg text-daet-ink">
              {rows.length === 0 ? "Nothing booked yet." : `${upcoming.length} coming up, ${past.length} past or cancelled.`}
            </p>
          </div>
          <ButtonLink href="/tours/browse">Find a trip</ButtonLink>
        </header>

        {error ? <Notice variant="error" className="mb-6">Your bookings could not be loaded right now. Please try again.</Notice> : null}

        {owing.length > 0 ? (
          <Notice variant="warning" className="mb-8">
            <p className="text-base font-bold">
              {owing.length === 1 ? "One trip is waiting for payment" : `${owing.length} trips are waiting for payment`}
              {owingAll ? `, ${formatPeso(owingTotal)} in total` : ""}.
            </p>
          </Notice>
        ) : null}

        {rows.length === 0 && !error ? (
          <EmptyState
            icon={<LineIcon name="calendar" />}
            title="No bookings yet"
            description="Choose a trip, pick a date, and it will show up here with your ticket and payment."
            action={<ButtonLink href="/tours/browse">Find a trip</ButtonLink>}
          />
        ) : null}

        {upcoming.length > 0 ? (
          <section aria-labelledby="upcoming" className="mb-10">
            <h2 id="upcoming" className="mb-4 text-2xl font-bold text-daet-ink">
              Coming up
            </h2>
            <ul className="space-y-3">
              {upcoming.map((b) => (
                <BookingRow key={b.id} booking={b} today={today} />
              ))}
            </ul>
          </section>
        ) : null}

        {past.length > 0 ? (
          <section aria-labelledby="past">
            <h2 id="past" className="mb-4 text-2xl font-bold text-daet-ink">
              Past and cancelled
            </h2>
            <ul className="space-y-2">
              {past.slice(0, PAST_SHOWN).map((b) => (
                <PastRow key={b.id} booking={b} />
              ))}
            </ul>
            {past.length > PAST_SHOWN ? (
              <details className="group mt-2">
                <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-slate-500 px-6 font-bold text-daet-ink group-open:hidden">
                  Show all {past.length}
                </summary>
                <ul className="space-y-2">
                  {past.slice(PAST_SHOWN).map((b) => (
                    <PastRow key={b.id} booking={b} />
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        ) : null}
      </div>
    </PageFrame>
  );
}

function packageOf(b: Row) {
  const pkg = Array.isArray(b.tours_packages) ? b.tours_packages[0] : b.tours_packages;
  const name = pkg?.title ?? (pkg?.location_name ? `Tour at ${pkg.location_name}` : "Tour");
  return { pkg, name };
}

function BookingRow({ booking: b, today }: { booking: Row; today: string }) {
  const { pkg, name } = packageOf(b);
  const status = STATUS[b.status] ?? { label: b.status, tone: "neutral" as const };
  const pay = PAYMENT[b.payment_status ?? "unpaid"] ?? PAYMENT.unpaid;
  const photo = PHOTOS[placePhoto(pkg?.title, pkg?.location_name)];
  const owes = owesPayment(b);
  const away = daysAway(b.tour_date, today);
  const total = formatPeso(b.total_amount);

  return (
    <li className="grid grid-cols-[88px_1fr] gap-x-4 gap-y-3 rounded-2xl bg-surface p-3 sm:grid-cols-[160px_1fr_auto] sm:p-4">
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-blue-100 dark:bg-blue-900/40 sm:aspect-[4/3]">
        {pkg?.cover_image_url ? (
          <img src={pkg.cover_image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <Image src={photo.src} alt="" fill sizes="160px" className="object-cover" />
        )}
      </div>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {owes ? <Badge tone="warning">{b.payment_status === "partial" ? "Balance due" : "Payment due"}</Badge> : <Badge tone={status.tone}>{status.label}</Badge>}
          <span className="text-slate-600 dark:text-slate-400">
            {owes ? `${status.label} by the operator` : b.status === "confirmed" || b.status === "completed" ? pay.label : null}
          </span>
        </p>
        <Link href={`/tours/bookings/${b.id}`} className="mt-1 block text-lg font-bold leading-snug text-daet-ink hover:text-blue-700 dark:hover:text-blue-300 sm:text-xl">
          {name}
        </Link>
        <p className="mt-1 text-daet-ink">
          {away ? <strong className="text-blue-700 dark:text-blue-300">{away}</strong> : null}
          {away ? ", " : null}
          {longDate(b.tour_date)} · {b.number_of_pax} guest{b.number_of_pax === 1 ? "" : "s"}
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-400">Ref {b.booking_reference}</p>
      </div>
      <div className="col-span-2 flex flex-col gap-2 sm:col-span-1 sm:w-56">
        <p className="flex items-baseline justify-between">
          <span className="text-sm text-slate-600 dark:text-slate-400">Total</span>
          <strong className="text-2xl text-daet-ink">{total}</strong>
        </p>
        {owes ? (
          <ButtonLink href={`/tours/bookings/${b.id}#payment`}>
            {b.payment_status === "partial" ? "Pay the balance" : `Pay ${total}`}
          </ButtonLink>
        ) : null}
        <div className="flex gap-2">
          {b.status === "confirmed" ? (
            <ButtonLink href={`/tours/bookings/${b.id}/ticket`} variant="secondary" className="flex-1 px-4">
              Ticket
            </ButtonLink>
          ) : null}
          <ButtonLink href={`/tours/bookings/${b.id}`} variant="secondary" className="flex-1 px-4">
            Details
          </ButtonLink>
        </div>
      </div>
    </li>
  );
}

/** Past and cancelled bookings: one compact row, no photo. */
function PastRow({ booking: b }: { booking: Row }) {
  const { name } = packageOf(b);
  const status = STATUS[b.status] ?? { label: b.status, tone: "neutral" as const };
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-surface px-4 py-3">
      <div className="min-w-0 flex-1 basis-60">
        <Link href={`/tours/bookings/${b.id}`} className="font-bold text-daet-ink hover:text-blue-700 dark:hover:text-blue-300">
          {name}
        </Link>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {longDate(b.tour_date)} · {b.number_of_pax} guest{b.number_of_pax === 1 ? "" : "s"} · Ref {b.booking_reference}
        </p>
      </div>
      <Badge tone={status.tone}>{status.label}</Badge>
      <ButtonLink href={`/tours/bookings/${b.id}`} variant="ghost" className="px-4">
        Details
      </ButtonLink>
    </li>
  );
}
