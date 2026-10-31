import { EmptyState } from "@/components/ui/empty-state";
import { LineIcon } from "@/components/ui/icons";
import { formatPeso } from "@/lib/money";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { DashboardHeader } from "@/components/ui/dashboard-header";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FREE_CANCELLATION_HOURS } from "@/lib/tours/cancellation";
import { manilaDayStartUtc, toManilaDateKey } from "@/lib/tours/events-calendar";
import { OpenChatButton } from "@/app/(subsystems)/tours/messages/open-chat-button";
import { BookingActionButtons } from "./booking-action-buttons";
import { CancellationReview, RefundPanel, type CancellationRequest } from "./cancellation-review";
import { isBusyReason, type BusyReason } from "@/lib/tours/guide-swap";
import { SwapReview, type PendingSwap } from "./swap-review";
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

  // Open cancellation requests, and money still to return on cancelled/declined bookings.
  const { data: requestRows } = bookingIds.length
    ? await supabase
        .from("tours_cancellations")
        .select("id, booking_id, reason, requested_at, status")
        .in("booking_id", bookingIds)
        .eq("status", "requested")
    : { data: [] as Array<CancellationRequest & { booking_id: string }> };
  const requestByBooking = new Map<string, CancellationRequest>(
    (requestRows ?? []).map((row) => [row.booking_id, row]),
  );
  const refundCandidates = (bookings ?? []).filter(
    (b) => (b.status === "cancelled" || b.status === "rejected") && Number(b.total_paid ?? 0) > 0,
  );
  const refundableByBooking = new Map<string, number>();
  await Promise.all(
    refundCandidates.map(async (b) => {
      const { data } = await supabase.rpc("tours_refundable_amount", { p_booking_id: b.id });
      if (Number(data ?? 0) > 0) refundableByBooking.set(b.id, Number(data));
    }),
  );
  const today = toManilaDateKey(new Date());

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

  if (guidesError) {
    console.error("Guides fetch error:", guidesError);
    console.error("Guides error details:", JSON.stringify(guidesError, null, 2));
  }

  // Get profile IDs
  const profileIds = guidesData?.map((g) => g.profile_id).filter(Boolean) || [];

  // Fetch profile names for guides (only if we have IDs)
  let profilesData = null;
  if (profileIds.length > 0) {
    const { data, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds);
    
    profilesData = data;
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
      return result;
    }) || [];

  // Guides' own availability for the dates on this page (F9), shown in the picker.
  const tourDates = [...new Set((bookings ?? []).map((b) => b.tour_date))];
  const { data: availabilityRows } =
    tourDates.length && availableGuides.length
      ? await supabase
          .from("tours_guide_availability")
          .select("guide_id, available_date, is_available")
          .in("available_date", tourDates)
          .in("guide_id", availableGuides.map((g) => g.id))
      : { data: [] as { guide_id: string; available_date: string; is_available: boolean }[] };
  const availabilityFor = (date: string): Record<string, boolean> =>
    Object.fromEntries((availabilityRows ?? []).filter((r) => r.available_date === date).map((r) => [r.guide_id, r.is_available]));

  // R6: who can take each upcoming date (approved, marked available, not on another tour that day).
  const upcomingDates = tourDates.filter((d) => d >= today);
  const busyRows = await Promise.all(
    upcomingDates.map(async (date) => {
      const { data } = await supabase.rpc("tours_guides_free_on", { p_date: date });
      return [date, (data ?? []) as Array<{ guide_id: string; full_name: string; reason: string | null }>] as const;
    }),
  );
  const busyByDate = new Map(busyRows.map(([date, rows]) => [date, rows]));
  const busyFor = (date: string): Record<string, BusyReason | null> =>
    Object.fromEntries((busyByDate.get(date) ?? []).map((r) => [r.guide_id, isBusyReason(r.reason) ? r.reason : null]));
  const pickerFor = (date: string) =>
    (busyByDate.get(date) ?? []).map((r) => ({ id: r.guide_id, full_name: r.full_name, reason: isBusyReason(r.reason) ? r.reason : null }));

  // R6: guides' pending swap requests on these bookings.
  const { data: swapRows } = bookingIds.length
    ? await supabase
        .from("tours_guide_swap_requests")
        .select("id, booking_id, from_guide_id, to_guide_id, reason, created_at")
        .in("booking_id", bookingIds)
        .eq("status", "pending")
    : { data: [] as Array<{ id: string; booking_id: string; from_guide_id: string; to_guide_id: string | null; reason: string; created_at: string }> };
  const guideName = (id: string | null) => (id ? availableGuides.find((g) => g.id === id)?.full_name ?? "A guide" : null);
  const swapByBooking = new Map<string, PendingSwap>(
    (swapRows ?? []).map((row) => [
      row.booking_id,
      { id: row.id, fromGuideId: row.from_guide_id, fromGuideName: guideName(row.from_guide_id) ?? "A guide", toGuideId: row.to_guide_id, toGuideName: guideName(row.to_guide_id), reason: row.reason, createdAt: row.created_at },
    ]),
  );

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500 text-slate-950",
    confirmed: "bg-green-500 text-slate-950",
    cancelled: "bg-muted-strong text-slate-900 dark:text-slate-100",
    completed: "bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-300",
    rejected: "bg-red-600 text-white",
  };

  const statusLabels: Record<string, string> = {
    pending: "Pending",
    confirmed: "Confirmed",
    cancelled: "Cancelled",
    completed: "Completed",
    rejected: "Declined",
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
        <header className="mb-6">
          <h1 className="display-2 text-daet-ink">Bookings</h1>
          <p className="mt-2 text-lg text-daet-ink">Every booking for {operator.business_name}, newest first.</p>
        </header>

        <nav aria-label="Filter by status" className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex w-max gap-2">
            {(
              [
                ["all", "All", stats.total],
                ["pending", "To confirm", stats.pending],
                ["confirmed", "Confirmed", stats.confirmed],
                ["completed", "Completed", stats.completed],
                ["rejected", "Declined", stats.rejected],
              ] as const
            ).map(([value, label, count]) => {
              const active = (params.status ?? "all") === value;
              return (
                <li key={value}>
                  <Link
                    href={`/tours/operator/bookings?status=${value}`}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[15px] font-bold transition active:scale-[0.98] ${active ? "bg-blue-600 text-white" : "bg-surface text-daet-ink hover:bg-blue-50 dark:hover:bg-blue-950/40"}`}
                  >
                    {label}
                    <span className={`rounded-full px-2 text-sm ${active ? "bg-white/20" : value === "pending" && count > 0 ? "bg-yellow-500 text-slate-950" : "bg-muted"}`}>{count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Bookings List */}
        {!bookings || bookings.length === 0 ? (
          <EmptyState
            icon={<LineIcon name="calendar" />}
            title="No bookings here"
            description={params.status && params.status !== "all" ? "Nothing with this status right now." : "Bookings appear here as soon as tourists request a date."}
          />
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => {
              const pkg = Array.isArray(booking.tours_packages)
                ? booking.tours_packages[0]
                : booking.tours_packages;

              return (
                <div
                  key={booking.id}
                  id={`booking-${booking.id}`}
                  className="scroll-mt-6 rounded-2xl bg-surface p-6 target:ring-2 target:ring-daet-forest/50"
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
                          <h3 className="text-xl font-bold text-daet-ink">
                            {pkg?.title || "Package"}
                          </h3>
                          <p className="mt-1 text-sm font-bold text-daet-forest dark:text-blue-300">
                            {booking.booking_reference}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${statusColors[booking.status] || "bg-muted text-slate-800 dark:text-slate-100"}`}
                        >
                          {statusLabels[booking.status] || booking.status}
                        </span>
                      </div>

                      {/* Details Grid */}
                      <div className="mb-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm md:grid-cols-4">
                        <div>
                          <p className="text-daet-ink/70">Tour Date</p>
                          <p className="font-bold text-daet-ink">
                            {new Date(booking.tour_date).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                        <div>
                          <p className="text-daet-ink/70">Participants</p>
                          <p className="font-bold text-daet-ink">{booking.number_of_pax} pax</p>
                        </div>
                        <div>
                          <p className="text-daet-ink/70">Contact</p>
                          <p className="font-bold text-daet-ink">{booking.contact_name}</p>
                          <p className="text-sm text-slate-600 dark:text-slate-400">{booking.contact_phone}</p>
                        </div>
                        <div>
                          <p className="text-daet-ink/70">Total Amount</p>
                          <p className="text-lg font-bold text-daet-forest dark:text-blue-300">
                            {formatPeso(booking.total_amount)}
                          </p>
                        </div>
                      </div>

                      {/* Special Requests */}
                      {booking.special_requests && (
                        <div className="mb-4 rounded-2xl bg-canvas p-3">
                          <p className="text-sm text-slate-600 dark:text-slate-400">Special Requests:</p>
                          <p className="mt-1 text-sm text-daet-ink">{booking.special_requests}</p>
                        </div>
                      )}

                      {/* Guide Assignment - Show for confirmed bookings */}
                      {booking.status === "confirmed" && (
                        <>
                          <div className="mb-4 rounded-2xl bg-canvas p-4">
                            <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
                              Guide Assignment
                            </p>
                            {swapByBooking.get(booking.id) ? (
                              <SwapReview swap={swapByBooking.get(booking.id)!} guides={pickerFor(booking.tour_date)} />
                            ) : null}
                            <GuideAssignment
                              bookingId={booking.id}
                              currentGuideId={booking.assigned_guide_id}
                              availableGuides={availableGuides || []}
                              availability={availabilityFor(booking.tour_date)}
                              busy={busyFor(booking.tour_date)}
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

                      {(booking.status === "cancelled" || booking.status === "rejected") && booking.cancellation_reason ? (
                        <p className="mb-4 rounded-2xl bg-canvas p-3 text-sm text-daet-ink">
                          <span className="font-bold">{booking.status === "cancelled" ? "Cancellation reason" : "Declined because"}:</span>{" "}
                          {booking.cancellation_reason}
                        </p>
                      ) : null}

                      {requestByBooking.has(booking.id) ? (
                        <CancellationReview
                          bookingId={booking.id}
                          request={requestByBooking.get(booking.id)!}
                          late={
                            manilaDayStartUtc(booking.tour_date).getTime() -
                              new Date(requestByBooking.get(booking.id)!.requested_at).getTime() <
                            FREE_CANCELLATION_HOURS * 3600 * 1000
                          }
                        />
                      ) : null}

                      {refundableByBooking.has(booking.id) ? (
                        <RefundPanel bookingId={booking.id} refundable={refundableByBooking.get(booking.id)!} />
                      ) : null}

                      {booking.status !== "cancelled" && booking.status !== "rejected" ? (
                        <div className="mb-3 flex flex-wrap gap-2">
                          <OpenChatButton bookingId={booking.id} label="Message tourist" variant="ghost" />
                          {booking.assigned_guide_id ? (
                            <OpenChatButton target={{ kind: "operator_guide", guideId: booking.assigned_guide_id }} label="Message guide" variant="ghost" />
                          ) : null}
                        </div>
                      ) : null}

                      {/* Actions */}
                      <BookingActionButtons
                        bookingId={booking.id}
                        currentStatus={booking.status}
                        tourDate={booking.tour_date}
                        totalPaid={Number(booking.total_paid ?? 0)}
                        today={today}
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
