import { redirect } from "next/navigation";
import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PaymentInstructions } from "./payment-instructions";

export const dynamic = "force-dynamic";

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

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/tours/my-bookings")}`);
  }

  // Debug: Log user info
  console.log("🔍 User ID:", user.id);
  console.log("🔍 User email:", user.email);

  // Fetch all bookings for this user (without operator payment details for now)
  const { data: bookings, error } = await supabase
    .from("tours_bookings")
    .select(
      `
      *,
      tours_packages (
        id,
        title,
        location_name,
        cover_image_url
      )
    `
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Debug: Log query results
  console.log("📊 Bookings data:", bookings);
  console.log("❌ Bookings error:", error);
  console.log("📊 Bookings count:", bookings?.length || 0);

  if (error) {
    console.error("Bookings fetch error:", error);
    console.error("Error message:", error.message);
    console.error("Error details:", error.details);
    console.error("Error hint:", error.hint);
    console.error("Error code:", error.code);
  }

  const statusColors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-900",
    confirmed: "bg-emerald-100 text-emerald-800",
    cancelled: "bg-gray-100 text-gray-800",
    completed: "bg-blue-100 text-blue-900",
    rejected: "bg-rose-100 text-rose-800",
  };

  const statusLabels: Record<string, string> = {
    pending: "Pending",
    confirmed: "Confirmed",
    cancelled: "Cancelled",
    completed: "Completed",
    rejected: "Rejected",
  };

  return (
    <PageFrame>
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-black text-daet-ink">My Bookings</h1>
            <p className="mt-2 text-sm text-daet-ink/60">
              View and manage your tour bookings
            </p>
          </div>
          <Link
            href="/tours/browse"
            className="rounded-full bg-daet-forest px-6 py-3 text-sm font-bold text-white transition hover:bg-daet-ink"
          >
            Browse Tours
          </Link>
        </div>

        {/* Back Button */}
        <div className="mb-6">
          <Link
            href="/tours/browse"
            className="inline-flex items-center gap-2 text-sm font-bold text-daet-ink/60 transition hover:text-daet-ink"
          >
            ← Back to Browse
          </Link>
        </div>

        {/* Bookings List */}
        {!bookings || bookings.length === 0 ? (
          <div className="rounded-3xl border border-daet-ink/10 bg-white p-12 text-center shadow-sm">
            <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-daet-sand text-4xl">
              📅
            </div>
            <h2 className="text-xl font-black text-daet-ink">No bookings yet</h2>
            <p className="mt-2 text-sm text-daet-ink/60">
              Start exploring and book your first tour!
            </p>
            <Link
              href="/tours/browse"
              className="mt-6 inline-block rounded-full bg-daet-forest px-8 py-3 text-sm font-bold text-white transition hover:bg-daet-ink"
            >
              Browse Tours
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => {
              const pkg = Array.isArray(booking.tours_packages)
                ? booking.tours_packages[0]
                : booking.tours_packages;

              const operator = Array.isArray(pkg?.tours_operators)
                ? pkg.tours_operators[0]
                : pkg?.tours_operators;

              return (
                <div
                  key={booking.id}
                  className="rounded-3xl border border-daet-ink/10 bg-white p-6 shadow-sm"
                >
                  <div className="flex gap-4">
                    {/* Package Image */}
                    {pkg?.cover_image_url && (
                      <img
                        src={pkg.cover_image_url}
                        alt={pkg.title}
                        className="h-32 w-40 flex-shrink-0 rounded-2xl object-cover"
                      />
                    )}

                    {/* Booking Info */}
                    <div className="flex flex-1 flex-col">
                      {/* Top Row: Package Title + Status */}
                      <div className="mb-2 flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <h3 className="text-xl font-black text-daet-ink">
                            {pkg?.title || "Package"}
                          </h3>
                          {operator && (
                            <p className="mt-1 text-sm font-bold text-daet-forest">
                              by {operator.business_name}
                            </p>
                          )}
                        </div>
                        <span
                          className={`rounded-full px-4 py-1 text-xs font-bold ${statusColors[booking.status] || "bg-gray-100 text-gray-800"}`}
                        >
                          {statusLabels[booking.status] || booking.status}
                        </span>
                      </div>

                      {/* Details Grid */}
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-daet-ink/60">Booking Reference</p>
                          <p className="font-bold text-daet-ink">
                            {booking.booking_reference}
                          </p>
                        </div>
                        <div>
                          <p className="text-daet-ink/60">Tour Date</p>
                          <p className="font-bold text-daet-ink">
                            {new Date(booking.tour_date).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                        <div>
                          <p className="text-daet-ink/60">Participants</p>
                          <p className="font-bold text-daet-ink">
                            {booking.number_of_pax} pax
                          </p>
                        </div>
                        <div>
                          <p className="text-daet-ink/60">Total Amount</p>
                          <p className="text-lg font-black text-daet-forest">
                            ₱{booking.total_amount.toLocaleString()}
                          </p>
                        </div>
                      </div>

                      {/* Payment Status - Show for confirmed bookings */}
                      {booking.status === "confirmed" && (
                        <div className="mt-4">
                          {booking.payment_status === "paid" ? (
                            <div className="rounded-xl bg-emerald-50 p-3 text-center">
                              <p className="text-sm font-bold text-emerald-800">
                                ✅ Payment Completed
                              </p>
                            </div>
                          ) : (
                            <PaymentInstructions
                              operatorName={operator?.business_name || "Operator"}
                              gcashNumber={operator?.gcash_number}
                              gcashName={operator?.gcash_name}
                              bankName={operator?.bank_name}
                              bankAccountNumber={operator?.bank_account_number}
                              bankAccountName={operator?.bank_account_name}
                              paymentInstructions={operator?.payment_instructions}
                              totalAmount={booking.total_amount}
                              bookingReference={booking.booking_reference}
                              operatorPhone={operator?.contact_phone}
                            />
                          )}
                        </div>
                      )}

                      {/* View Details Link */}
                      <Link
                        href={`/tours/bookings/${booking.id}`}
                        className="mt-3 text-sm font-bold text-daet-forest transition hover:text-daet-ink"
                      >
                        View Full Details →
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Stats Summary - if there are bookings */}
        {bookings && bookings.length > 0 && (
          <div className="mt-8 grid grid-cols-5 gap-4">
            <div className="rounded-2xl border border-daet-ink/10 bg-white p-4 text-center">
              <p className="text-2xl font-black text-daet-ink">{bookings.length}</p>
              <p className="text-xs text-daet-ink/60">Total</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center">
              <p className="text-2xl font-black text-amber-900">
                {bookings.filter((b) => b.status === "pending").length}
              </p>
              <p className="text-xs text-amber-900/60">Pending</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
              <p className="text-2xl font-black text-emerald-900">
                {bookings.filter((b) => b.status === "confirmed").length}
              </p>
              <p className="text-xs text-emerald-900/60">Confirmed</p>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-center">
              <p className="text-2xl font-black text-blue-900">
                {bookings.filter((b) => b.status === "completed").length}
              </p>
              <p className="text-xs text-blue-900/60">Completed</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-center">
              <p className="text-2xl font-black text-gray-900">
                {
                  bookings.filter(
                    (b) => b.status === "cancelled" || b.status === "rejected"
                  ).length
                }
              </p>
              <p className="text-xs text-gray-900/60">Cancelled</p>
            </div>
          </div>
        )}
      </div>
    </PageFrame>
  );
}
