import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/tours/operator-access";
import { issueBookingTicket } from "@/lib/tours/qr-issue";
import { SaveTicketOffline } from "@/components/tours/save-ticket-offline";
import { MapPinIcon } from "@/components/ui/icons";
import { PrintTicketButton } from "./print-ticket-button";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

const tourDate = (dateKey: string) =>
  new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function BookingTicketPage({ params }: PageProps) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">Configure Supabase to view tickets.</Notice>
      </PageFrame>
    );
  }

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/tours/bookings/${id}/ticket`)}`);

  const { data: booking } = await supabase
    .from("tours_bookings")
    .select("id, booking_reference, status, tour_date, number_of_pax, contact_name, tours_packages ( title, location_name )")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!booking) notFound();

  const back = (
    <Link href={`/tours/bookings/${booking.id}`} className="text-sm font-bold text-daet-ink/70 hover:text-daet-ink print:hidden">
      ← Back to booking
    </Link>
  );

  if (booking.status !== "confirmed" && booking.status !== "completed") {
    return (
      <PageFrame>
        <div className="mx-auto max-w-md">
          {back}
          <Notice variant="info" className="mt-4" title="Your ticket is not ready yet">
            {booking.status === "pending"
              ? "The ticket appears here once the operator confirms your booking."
              : "This booking is no longer active, so it has no ticket."}
          </Notice>
        </div>
      </PageFrame>
    );
  }

  const ticket = await issueBookingTicket(booking.id, booking.tour_date);
  const pkg = Array.isArray(booking.tours_packages) ? booking.tours_packages[0] : booking.tours_packages;

  return (
    <PageFrame>
      <div className="mx-auto max-w-md">
        {back}
        <section className="mt-4 rounded-3xl border border-daet-ink/10 bg-white p-6 text-center shadow-card print:border-black print:shadow-none">
          <p className="text-sm font-bold text-daet-leaf print:text-black">CONNECT-DAET tour ticket</p>
          <h1 className="mt-2 text-2xl font-black text-daet-ink">{pkg?.title ?? "Tour booking"}</h1>
          <p className="mt-1 text-sm text-daet-ink/70">{tourDate(booking.tour_date)}</p>
          {ticket ? (
            <img
              src={ticket.pngDataUrl}
              alt={`Ticket QR code for booking ${booking.booking_reference}`}
              width={720}
              height={720}
              className="mx-auto mt-5 h-64 w-64 print:h-[2.6in] print:w-[2.6in]"
            />
          ) : (
            <Notice variant="warning" className="mt-5 text-left">
              The ticket QR is not set up on this site yet. Show your booking reference to the guide instead.
            </Notice>
          )}
          <p className="mt-4 text-2xl font-black tracking-wide text-daet-forest">{booking.booking_reference}</p>
          <p className="mt-1 text-sm text-daet-ink/70">
            {booking.number_of_pax} guest{booking.number_of_pax === 1 ? "" : "s"} · {booking.contact_name}
          </p>
          {pkg?.location_name ? <p className="mt-1 inline-flex items-center gap-1 text-xs text-daet-ink/70"><MapPinIcon className="h-3.5 w-3.5" /> {pkg.location_name}</p> : null}
          {ticket ? (
            <p className="mt-4 text-xs leading-5 text-daet-ink/70">
              Show this QR to your guide on the tour day. Valid until the end of the tour day.
            </p>
          ) : null}
        </section>
        {ticket ? <PrintTicketButton /> : null}
        {ticket ? <SaveTicketOffline /> : null}
      </div>
    </PageFrame>
  );
}
