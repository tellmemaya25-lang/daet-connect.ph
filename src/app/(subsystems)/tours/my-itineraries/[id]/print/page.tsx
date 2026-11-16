import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { ItineraryPrintSheet } from "@/components/tours/itinerary-print-sheet";
import { PrintPageButton } from "@/components/tours/print-page-button";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rowsToDays } from "@/lib/tours/itinerary/form";
import { isUuid } from "@/lib/tours/operator-access";
import { appBaseUrl } from "@/lib/tours/qr-issue";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";

export const metadata = { title: "Print itinerary", robots: { index: false } };

const monthDay = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function PrintItineraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isSupabaseConfigured() || !isUuid(id)) notFound();
  const session = await getAuthenticatedSession();
  if (!session.user) redirect(`/login?next=${encodeURIComponent(`/tours/my-itineraries/${id}/print`)}`);
  const supabase = await createSupabaseServerClient();

  const { data: itinerary } = await supabase
    .from("tours_itineraries")
    .select("id, title, start_date, end_date, summary, preferences, tours_itinerary_items ( day_number, item_order, item_kind, location_name, tip, latitude, longitude, start_time, end_time, travel_minutes, tours_attractions ( slug, entrance_fee ) )")
    .eq("id", id)
    .eq("tourist_id", session.user.id)
    .maybeSingle();
  if (!itinerary) notFound();

  const fees = new Map<string, number | null>();
  const rows = (itinerary.tours_itinerary_items ?? []).map((item: Record<string, unknown>) => {
    const attraction = (Array.isArray(item.tours_attractions) ? item.tours_attractions[0] : item.tours_attractions) as { slug?: string; entrance_fee?: number | string | null } | null;
    const fee = attraction?.entrance_fee == null ? null : Number(attraction.entrance_fee);
    fees.set(String(item.location_name), Number.isFinite(fee) ? fee : null);
    return { ...(item as object), attraction_slug: attraction?.slug ?? null } as Parameters<typeof rowsToDays>[0][number];
  });
  const days = rowsToDays(rows, itinerary.start_date);

  const { data: tripBookings } = itinerary.start_date
    ? await supabase
        .from("tours_bookings")
        .select("booking_reference, tour_date, number_of_pax, status, tours_packages ( title )")
        .eq("user_id", session.user.id)
        .gte("tour_date", itinerary.start_date)
        .lte("tour_date", itinerary.end_date ?? itinerary.start_date)
        .in("status", ["pending", "confirmed", "completed"])
        .order("tour_date")
    : { data: [] };
  const bookings = (tripBookings ?? []).map((b) => ({
    reference: b.booking_reference,
    date: b.tour_date,
    pax: b.number_of_pax,
    status: b.status,
    title: (Array.isArray(b.tours_packages) ? b.tours_packages[0] : b.tours_packages)?.title ?? "Tour",
  }));

  const dates = itinerary.start_date
    ? itinerary.end_date && itinerary.end_date !== itinerary.start_date
      ? `${monthDay(itinerary.start_date)} to ${monthDay(itinerary.end_date)}`
      : monthDay(itinerary.start_date)
    : null;

  return (
    <PageFrame>
      <div className="mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/tours/my-itineraries/${id}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-blue-700 hover:underline dark:text-blue-300">
          <span aria-hidden="true">←</span> Back to the plan
        </Link>
        <PrintPageButton />
      </div>
      <p className="mx-auto mb-4 max-w-3xl text-sm text-slate-600 dark:text-slate-400 print:hidden">
        To get a PDF, press the button and choose “Save as PDF” as the printer.
      </p>
      <ItineraryPrintSheet title={itinerary.title} subtitle={dates} summary={itinerary.summary} days={days} fees={fees} bookings={bookings} link={`${appBaseUrl()}/tours/my-itineraries/${id}`} />
    </PageFrame>
  );
}
