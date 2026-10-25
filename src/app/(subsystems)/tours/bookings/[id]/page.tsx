import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPaymongoConfigured } from "@/lib/paymongo/client";
import { cancellationOption } from "@/lib/tours/cancellation";
import { PushOptIn } from "@/components/tours/push-opt-in";
import { OpenChatButton } from "@/app/(subsystems)/tours/messages/open-chat-button";
import { CancelBookingPanel, type MyCancellation } from "./cancel-booking-panel";
import { BookingPaymentPanel, type PanelPayment, type PanelProof } from "./booking-payment-panel";
import { ReviewForm } from "./review-form";
import { ReviewList } from "@/components/tours/review-list";
import type { Review } from "@/lib/tours/reviews";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BookingDetailPage({ params, searchParams }: PageProps) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">
          Configure Supabase to view bookings.
        </Notice>
      </PageFrame>
    );
  }

  const { id } = await params;
  const { payment } = await searchParams;
  const paymentReturn = payment === "success" || payment === "cancelled" ? payment : null;
  const supabase = await createSupabaseServerClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/tours/bookings/${id}`)}`);
  }

  // Fetch booking details
  const { data: booking, error } = await supabase
    .from("tours_bookings")
    .select(
      `
      *,
      tours_packages (
        id,
        title,
        location_name,
        duration_value,
        duration_type,
        cover_image_url,
        tours_operators (
          business_name,
          contact_phone,
          gcash_number,
          gcash_name,
          bank_name,
          bank_account_number,
          bank_account_name,
          payment_instructions
        )
      )
    `
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !booking) {
    console.error("Booking fetch error:", error);
    notFound();
  }

  const pkg = Array.isArray(booking.tours_packages)
    ? booking.tours_packages[0]
    : booking.tours_packages;

  const operator = Array.isArray(pkg?.tours_operators)
    ? pkg.tours_operators[0]
    : pkg?.tours_operators;

  const [{ data: paymentRows }, { data: proofRows }, { data: cancellation }, { data: myReview }] = await Promise.all([
    supabase
      .from("tours_payments")
      .select("id, amount, payment_method, provider, provider_method, reference_number, payment_date, payment_status")
      .eq("booking_id", booking.id)
      .order("payment_date", { ascending: false }),
    supabase
      .from("tours_payment_proofs")
      .select("id, amount, payment_method, reference_number, verification_status, rejection_reason, submitted_at")
      .eq("booking_id", booking.id)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("tours_cancellations")
      .select("status, reason, admin_notes")
      .eq("booking_id", booking.id)
      .maybeSingle(),
    supabase
      .from("tours_reviews")
      .select("id, rating, comment, created_at, operator_reply, replied_at, is_hidden, hidden_reason")
      .eq("booking_id", booking.id)
      .maybeSingle(),
  ]);

  const statusColors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-900",
    confirmed: "bg-emerald-100 text-emerald-800",
    cancelled: "bg-gray-100 text-gray-800",
    completed: "bg-blue-100 text-blue-900",
    rejected: "bg-rose-100 text-rose-800",
  };

  const statusLabels: Record<string, string> = {
    pending: "Pending Confirmation",
    confirmed: "Confirmed",
    cancelled: "Cancelled",
    completed: "Completed",
    rejected: "Declined by operator",
  };

  return (
    <PageFrame>
      <div className="mx-auto max-w-4xl">
        {/* Success Message */}
        {booking.status === "pending" && (
          <div className="mb-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl">
              ✓
            </div>
            <h2 className="text-2xl font-black text-emerald-900">Booking Submitted!</h2>
            <p className="mt-2 text-sm text-emerald-800">
              Your booking has been sent to the operator for confirmation.
              <br />
              You will see the update here and in your notifications.
            </p>
          </div>
        )}

        {booking.status === "pending" || booking.status === "confirmed" ? <PushOptIn variant="prompt" /> : null}

        {/* Booking Reference */}
        <div className="mb-6 rounded-3xl border border-daet-ink/10 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-bold text-daet-ink/70">BOOKING REFERENCE</p>
          <h1 className="mt-2 text-3xl font-black text-daet-forest">
            {booking.booking_reference}
          </h1>
          <p className="mt-2 text-xs text-daet-ink/70">
            Save this reference number for your records
          </p>
        </div>

        {/* Status Badge */}
        <div className="mb-6 flex flex-col items-center gap-3">
          <span
            className={`rounded-full px-6 py-2 text-sm font-bold ${statusColors[booking.status] || "bg-gray-100 text-gray-800"}`}
          >
            {statusLabels[booking.status] || booking.status}
          </span>
          {booking.status !== "cancelled" && booking.status !== "rejected" ? (
            <div className="flex flex-wrap justify-center gap-2">
              <OpenChatButton bookingId={booking.id} label="Message the operator" />
              {booking.assigned_guide_id ? (
                <OpenChatButton target={{ kind: "guide_tourist", bookingId: booking.id }} label="Message your guide" variant="ghost" />
              ) : null}
            </div>
          ) : null}
          {booking.status === "confirmed" ? (
            <Link
              href={`/tours/bookings/${booking.id}/ticket`}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-daet-forest px-6 text-sm font-bold text-white transition hover:bg-daet-ink"
            >
              Show my ticket QR
            </Link>
          ) : null}
        </div>

        {(booking.status === "cancelled" || booking.status === "rejected") && booking.cancellation_reason ? (
          <Notice variant={booking.status === "rejected" ? "warning" : "info"} className="mb-6" title={booking.status === "rejected" ? "The operator declined this booking" : "This booking was cancelled"}>
            {booking.cancellation_reason}
            {Number(booking.total_paid ?? 0) > 0 ? " Any amount you paid will be refunded by the operator." : ""}
          </Notice>
        ) : null}

        {/* Package Details */}
        {pkg && (
          <section className="mb-6 rounded-3xl border border-daet-ink/10 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wide text-daet-ink/70">
              Tour Package
            </h3>
            <div className="mt-4 flex gap-4">
              {pkg.cover_image_url && (
                <img
                  src={pkg.cover_image_url}
                  alt={pkg.title}
                  className="h-24 w-32 rounded-2xl object-cover"
                />
              )}
              <div className="flex-1">
                <h2 className="text-xl font-black text-daet-ink">{pkg.title}</h2>
                <p className="mt-1 text-sm text-daet-ink/70">
                  📍 {pkg.location_name} · ⏱️ {pkg.duration_value}{" "}
                  {pkg.duration_type === "hours" ? "hours" : "days"}
                </p>
                {operator && (
                  <p className="mt-1 text-sm font-bold text-daet-forest">
                    by {operator.business_name}
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {booking.status === "completed" ? (
          <section id="review" className="mb-6 rounded-3xl border border-daet-ink/10 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wide text-daet-ink/70">
              {myReview ? "Your review" : "Rate your tour"}
            </h3>
            <div className="mt-4">
              {myReview ? (
                <>
                  <ReviewList reviews={[myReview as Review]} operatorName={operator?.business_name ?? "the operator"} />
                  {myReview.is_hidden ? (
                    <Notice variant="warning" className="mt-3" title="Hidden by the Tourism Office">
                      {myReview.hidden_reason || "This review is not shown publicly."}
                    </Notice>
                  ) : null}
                </>
              ) : (
                <ReviewForm bookingId={booking.id} />
              )}
            </div>
          </section>
        ) : null}

        {/* Booking Details */}
        <section className="mb-6 rounded-3xl border border-daet-ink/10 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-wide text-daet-ink/70">
            Booking Details
          </h3>

          <div className="mt-4 space-y-3">
            <div className="flex justify-between border-b border-daet-ink/10 pb-3">
              <span className="text-sm text-daet-ink/70">Tour Date</span>
              <span className="font-bold text-daet-ink">
                {new Date(booking.tour_date).toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>

            <div className="flex justify-between border-b border-daet-ink/10 pb-3">
              <span className="text-sm text-daet-ink/70">Number of Participants</span>
              <span className="font-bold text-daet-ink">{booking.number_of_pax} pax</span>
            </div>

            {booking.price_per_pax && (
              <div className="flex justify-between border-b border-daet-ink/10 pb-3">
                <span className="text-sm text-daet-ink/70">Price per Person</span>
                <span className="font-bold text-daet-ink">
                  ₱{booking.price_per_pax.toLocaleString()}
                </span>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <span className="text-lg font-bold text-daet-ink">Total Amount</span>
              <span className="text-2xl font-black text-daet-forest">
                ₱{booking.total_amount.toLocaleString()}
              </span>
            </div>
          </div>
        </section>

        {booking.status !== "cancelled" && booking.status !== "rejected" ? (
          <BookingPaymentPanel
            booking={booking}
            operator={operator ?? null}
            payments={(paymentRows ?? []) as PanelPayment[]}
            proofs={(proofRows ?? []) as PanelProof[]}
            onlinePaymentEnabled={isPaymongoConfigured()}
            paymentReturn={paymentReturn}
          />
        ) : null}

        <CancelBookingPanel
          bookingId={booking.id}
          option={cancellationOption(booking)}
          cancellation={(cancellation as MyCancellation | null) ?? null}
        />

        {/* Contact Information */}
        <section className="mb-6 rounded-3xl border border-daet-ink/10 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-wide text-daet-ink/70">
            Contact Information
          </h3>

          <div className="mt-4 space-y-2 text-sm">
            <div>
              <span className="text-daet-ink/70">Name:</span>{" "}
              <span className="font-bold text-daet-ink">{booking.contact_name}</span>
            </div>
            <div>
              <span className="text-daet-ink/70">Email:</span>{" "}
              <span className="font-bold text-daet-ink">{booking.contact_email}</span>
            </div>
            <div>
              <span className="text-daet-ink/70">Phone:</span>{" "}
              <span className="font-bold text-daet-ink">{booking.contact_phone}</span>
            </div>

            {booking.special_requests && (
              <div className="mt-4 rounded-xl bg-daet-sand/30 p-3">
                <p className="text-xs font-bold text-daet-ink/70">Special Requests:</p>
                <p className="mt-1 text-sm text-daet-ink">{booking.special_requests}</p>
              </div>
            )}
          </div>
        </section>

        {/* Actions */}
        <div className="flex gap-3">
          <Link
            href="/tours/browse"
            className="flex-1 rounded-full border border-daet-ink/20 py-3 text-center text-sm font-bold text-daet-ink transition hover:bg-daet-sand"
          >
            Browse More Tours
          </Link>
          <Link
            href="/tours/my-bookings"
            className="flex-1 rounded-full bg-daet-forest py-3 text-center text-sm font-bold text-white transition hover:bg-daet-ink"
          >
            View My Bookings
          </Link>
        </div>
      </div>
    </PageFrame>
  );
}
