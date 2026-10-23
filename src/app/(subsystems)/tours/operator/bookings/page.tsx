import { redirect } from "next/navigation";
import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { DashboardHeader } from "@/components/ui/dashboard-header";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BookingActionButtons } from "./booking-action-buttons";
import { GuideAssignment } from "./guide-assignment";
import { PaymentRecorder } from "./payment-recorder";
import { ProofReview, type ReviewableProof } from "./proof-review";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  status?: string;
}>;

export default async function OperatorBookingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">
          Configure Supabase to view bookings.
        </Notice>
      </PageFrame>
    );
  }

  const params = await searchParams;
  const supabase = await createSupabaseServerClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/tours/operator/bookings")}`);
  }

  // Get operator profile
  const { data: operator } = await supabase
    .from("tours_operators")
    .select("id, business_name")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!operator) {
    return (
      <PageFrame>
        <Notice variant="error" title="Operator profile not found">
          You need an approved operator account to view bookings.
        </Notice>
      </PageFrame>
    );
  }

  // Build query for bookings
  let query = supabase
    .from("tours_bookings")
    .select(
      `
      *,
      tours_packages!inner (
        id,
        title,
        cover_image_url,
        operator_id
      )
    `
    )
    .eq("tours_packages.operator_id", operator.id)
    .order("created_at", { ascending: false });

  // Filter by status if provided
  if (params.status && params.status !== "all") {
    query = query.eq("status", params.status);
  }

  const { data: bookings, error } = await query;

  // Receipts waiting for verification on these bookings (RLS: operator's own bookings only)
  const bookingIds = (bookings ?? []).map((b) => b.id);
  const { data: pendingProofRows } = bookingIds.length
    ? await supabase
        .from("tours_payment_proofs")
        .select("id, booking_id, amount, payment_method, reference_number, submitted_at")
        .in("booking_id", bookingIds)
        .eq("verification_status", "pending")
        .order("submitted_at", { ascending: true })
    : { data: [] as Array<ReviewableProof & { booking_id: string }> };
  const proofsByBooking = new Map<string, ReviewableProof[]>();
  for (const proof of pendingProofRows ?? []) {
    const list = proofsByBooking.get(proof.booking_id) ?? [];
    list.push(proof);
    proofsByBooking.set(proof.booking_id, list);
  }

  if (error) {
    console.error("Bookings fetch error:", error);
    console.error("Bookings error details:", JSON.stringify(error, null, 2));
  }

  // Fetch approved guides for assignment (with full names from profiles)
  const { data: guidesData, error: guidesError } = await supabase
    .from("tours_guides")
    .select("id, profile_id, contact_phone")
    .eq("accreditation_status", "approved")
    .order("id", { ascending: true });

  console.log("Guides data fetched:", guidesData?.length || 0);
  if (guidesError) {
    console.error("Guides fetch error:", guidesError);
    console.error("Guides error details:", JSON.stringify(guidesError, null, 2));
  }

  // Get profile IDs
  const profileIds = guidesData?.map((g) => g.profile_id).filter(Boolean) || [];
  console.log("Profile IDs to fetch:", profileIds);

  // Fetch profile names for guides (only if we have IDs)
  let profilesData = null;
  if (profileIds.length > 0) {
    const { data, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds);
    
    profilesData = data;
    console.log("Profiles data fetched:", profilesData?.length || 0);
    if (profilesError) console.error("Profiles fetch error:", profilesError);
  }

  // Combine guides with their profile names
  const availableGuides =
    guidesData?.map((guide) => {
      const profile = profilesData?.find((p) => p.id === guide.profile_id);
      const result = {
        id: guide.id,
        full_name: profile?.full_name || "Unknown Guide",
        contact_phone: guide.contact_phone,
      };
      console.log("Mapped guide:", result);
      return result;
    }) || [];

  console.log("Total available guides:", availableGuides.length);

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

  // Calculate stats
  const allBookings = bookings || [];
  const stats = {
    total: allBookings.length,
    pending: allBookings.filter((b) => b.status === "pending").length,
    confirmed: allBookings.filter((b) => b.status === "confirmed").length,
    completed: allBookings.filter((b) => b.status === "completed").length,
    rejected: allBookings.filter((b) => b.status === "rejected").length,
  };

  return (
    <PageFrame>
      <DashboardHeader role="operator" />

      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-black text-daet-ink">Booking Management</h1>
          <p className="mt-2 text-sm text-daet-ink/60">
            Manage bookings for {operator.business_name}
          </p>
        </div>

        {/* Back Button */}
        <div className="mb-6">
          <Link
            href="/tours/operator/dashboard"
            className="inline-flex items-center gap-2 text-sm font-bold text-daet-ink/60 transition hover:text-daet-ink"
          >
            ← Back to Dashboard
          </Link>
        </div>

        {/* Stats Cards */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
          <Link
            href="/tours/operator/bookings?status=all"
            className={`rounded-2xl border p-4 text-center transition hover:shadow-md ${
              !params.status || params.status === "all"
                ? "border-daet-forest bg-daet-forest/5"
                : "border-daet-ink/10 bg-white"
            }`}
          >
            <p className="text-3xl font-black text-daet-ink">{stats.total}</p>
            <p className="text-xs text-daet-ink/60">Total</p>
          </Link>
          <Link
            href="/tours/operator/bookings?status=pending"
            className={`rounded-2xl border p-4 text-center transition hover:shadow-md ${
              params.status === "pending"
                ? "border-amber-300 bg-amber-50"
                : "border-amber-200 bg-amber-50"
            }`}
          >
            <p className="text-3xl font-black text-amber-900">{stats.pending}</p>
            <p className="text-xs text-amber-900/60">Pending</p>
          </Link>
          <Link
            href="/tours/operator/bookings?status=confirmed"
            className={`rounded-2xl border p-4 text-center transition hover:shadow-md ${
              params.status === "confirmed"
                ? "border-emerald-300 bg-emerald-50"
                : "border-emerald-200 bg-emerald-50"
            }`}
          >
            <p className="text-3xl font-black text-emerald-900">{stats.confirmed}</p>
            <p className="text-xs text-emerald-900/60">Confirmed</p>
          </Link>
          <Link
            href="/tours/operator/bookings?status=completed"
            className={`rounded-2xl border p-4 text-center transition hover:shadow-md ${
              params.status === "completed"
                ? "border-blue-300 bg-blue-50"
                : "border-blue-200 bg-blue-50"
            }`}
          >
            <p className="text-3xl font-black text-blue-900">{stats.completed}</p>
            <p className="text-xs text-blue-900/60">Completed</p>
          </Link>
          <Link
            href="/tours/operator/bookings?status=rejected"
            className={`rounded-2xl border p-4 text-center transition hover:shadow-md ${
              params.status === "rejected"
                ? "border-gray-300 bg-gray-50"
                : "border-gray-200 bg-gray-50"
            }`}
          >
            <p className="text-3xl font-black text-gray-900">{stats.rejected}</p>
            <p className="text-xs text-gray-900/60">Rejected</p>
          </Link>
        </div>

        {/* Bookings List */}
        {!bookings || bookings.length === 0 ? (
          <div className="rounded-3xl border border-daet-ink/10 bg-white p-12 text-center shadow-sm">
            <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-daet-sand text-4xl">
              📅
            </div>
            <h2 className="text-xl font-black text-daet-ink">No bookings found</h2>
            <p className="mt-2 text-sm text-daet-ink/60">
              {params.status && params.status !== "all"
                ? `No ${params.status} bookings at the moment.`
                : "You don't have any bookings yet."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => {
              const pkg = Array.isArray(booking.tours_packages)
                ? booking.tours_packages[0]
                : booking.tours_packages;

              return (
                <div
                  key={booking.id}
                  className="rounded-3xl border border-daet-ink/10 bg-white p-6 shadow-sm"
                >
                  <div className="flex gap-6">
                    {/* Package Image */}
                    {pkg?.cover_image_url && (
                      <img
                        src={pkg.cover_image_url}
                        alt={pkg.title}
                        className="h-32 w-40 flex-shrink-0 rounded-2xl object-cover"
                      />
                    )}

                    {/* Booking Details */}
                    <div className="flex flex-1 flex-col">
                      {/* Top Row: Package + Status */}
                      <div className="mb-4 flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-xl font-black text-daet-ink">
                            {pkg?.title || "Package"}
                          </h3>
                          <p className="mt-1 text-sm font-bold text-daet-forest">
                            {booking.booking_reference}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-4 py-1 text-xs font-bold ${statusColors[booking.status] || "bg-gray-100 text-gray-800"}`}
                        >
                          {statusLabels[booking.status] || booking.status}
                        </span>
                      </div>

                      {/* Details Grid */}
                      <div className="mb-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm md:grid-cols-4">
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
                          <p className="font-bold text-daet-ink">{booking.number_of_pax} pax</p>
                        </div>
                        <div>
                          <p className="text-daet-ink/60">Contact</p>
                          <p className="font-bold text-daet-ink">{booking.contact_name}</p>
                          <p className="text-xs text-daet-ink/60">{booking.contact_phone}</p>
                        </div>
                        <div>
                          <p className="text-daet-ink/60">Total Amount</p>
                          <p className="text-lg font-black text-daet-forest">
                            ₱{booking.total_amount.toLocaleString()}
                          </p>
                        </div>
                      </div>

                      {/* Special Requests */}
                      {booking.special_requests && (
                        <div className="mb-4 rounded-xl bg-daet-sand/30 p-3">
                          <p className="text-xs font-bold text-daet-ink/60">Special Requests:</p>
                          <p className="mt-1 text-sm text-daet-ink">{booking.special_requests}</p>
                        </div>
                      )}

                      {/* Guide Assignment - Show for confirmed bookings */}
                      {booking.status === "confirmed" && (
                        <>
                          <div className="mb-4 rounded-xl border border-daet-forest/20 bg-daet-forest/5 p-4">
                            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-daet-ink/60">
                              Guide Assignment
                            </p>
                            <GuideAssignment
                              bookingId={booking.id}
                              currentGuideId={booking.assigned_guide_id}
                              availableGuides={availableGuides || []}
                            />
                          </div>

                          <ProofReview proofs={proofsByBooking.get(booking.id) ?? []} />

                          {/* Payment Tracking */}
                          <div className="mb-4">
                            <PaymentRecorder
                              bookingId={booking.id}
                              bookingReference={booking.booking_reference}
                              totalAmount={booking.total_amount}
                              totalPaid={booking.total_paid || 0}
                              paymentStatus={booking.payment_status || "unpaid"}
                            />
                          </div>
                        </>
                      )}

                      {/* Actions */}
                      <BookingActionButtons
                        bookingId={booking.id}
                        currentStatus={booking.status}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageFrame>
  );
}
