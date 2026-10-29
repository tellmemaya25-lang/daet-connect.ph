import { LineIcon } from "@/components/ui/icons";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { isBusyReason } from "@/lib/tours/guide-swap";
import { SwapRequest, type MySwap } from "./swap-request";

export const dynamic = "force-dynamic";

export default async function GuideMyToursPage() {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">
          Configure Supabase to view assigned tours.
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
    redirect(`/login?next=${encodeURIComponent("/tours/guide/my-tours")}`);
  }

  // Get guide profile with full_name from profiles
  const { data: guide, error: guideError } = await supabase
    .from("tours_guides")
    .select("id, accreditation_status, profile_id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (guideError || !guide) {
    return (
      <PageFrame>
        <Notice variant="error" title="Guide profile not found">
          You need an approved guide account to view assigned tours.
        </Notice>
      </PageFrame>
    );
  }

  if (guide.accreditation_status !== "approved") {
    return (
      <PageFrame>
        <Notice variant="warning" title="Account pending approval">
          Your guide account is pending approval. You'll be able to view assigned tours once
          approved.
        </Notice>
      </PageFrame>
    );
  }

  // Get full_name from profiles
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const guideName = profile?.full_name || "Guide";

  // Fetch assigned tours
  const { data: assignedTours, error } = await supabase
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
          contact_phone
        )
      )
    `
    )
    .eq("assigned_guide_id", guide.id)
    .in("status", ["confirmed", "completed"])
    .order("tour_date", { ascending: true });

  if (error) {
    console.error("Assigned tours fetch error:", error);
  }

  const statusColors: Record<string, string> = {
    confirmed: "bg-emerald-100 text-emerald-800",
    completed: "bg-blue-100 text-blue-900",
  };

  const statusLabels: Record<string, string> = {
    confirmed: "Upcoming",
    completed: "Completed",
  };

  // Separate upcoming and completed
  // Compare Manila calendar days so today's tours stay under "Upcoming".
  const today = toManilaDateKey(new Date());
  const upcomingTours =
    assignedTours?.filter((t) => t.status === "confirmed" && t.tour_date >= today) || [];
  const completedTours =
    assignedTours?.filter((t) => t.status === "completed" || t.tour_date < today) || [];

  // R6: other guides free on each upcoming date, and this guide's latest swap request per tour.
  const pickers = new Map(
    await Promise.all(
      [...new Set(upcomingTours.map((t) => t.tour_date))].map(async (date) => {
        const { data } = await supabase.rpc("tours_guides_free_on", { p_date: date });
        const rows = ((data ?? []) as Array<{ guide_id: string; full_name: string; reason: string | null }>)
          .filter((r) => r.guide_id !== guide.id)
          .map((r) => ({ id: r.guide_id, full_name: r.full_name, reason: isBusyReason(r.reason) ? r.reason : null }));
        return [date, rows] as const;
      }),
    ),
  );
  const { data: swapRows } = upcomingTours.length
    ? await supabase
        .from("tours_guide_swap_requests")
        .select("id, booking_id, status, to_guide_id, reason, decision_note, created_at")
        .eq("from_guide_id", guide.id)
        .in("booking_id", upcomingTours.map((t) => t.id))
        .order("created_at", { ascending: false })
    : { data: [] as Array<{ id: string; booking_id: string; status: string; to_guide_id: string | null; reason: string; decision_note: string | null; created_at: string }> };
  const latestSwap = new Map<string, MySwap>();
  for (const row of swapRows ?? []) {
    if (latestSwap.has(row.booking_id)) continue;
    const toName = row.to_guide_id ? [...pickers.values()].flat().find((g) => g.id === row.to_guide_id)?.full_name ?? null : null;
    latestSwap.set(row.booking_id, { id: row.id, status: row.status, toGuideName: toName, reason: row.reason, decisionNote: row.decision_note });
  }

  return (
    <PageFrame>
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-black text-daet-ink">My Assigned Tours</h1>
          <p className="mt-2 text-sm text-daet-ink/70">
            Tours assigned to {guideName}
          </p>
        </div>

        {/* Back Button */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/tours/guide/dashboard"
            className="inline-flex items-center gap-2 text-sm font-bold text-daet-ink/70 transition hover:text-daet-ink"
          >
            ← Back to Dashboard
          </Link>
          <Link
            href="/tours/guide/check-in"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-daet-forest px-6 text-sm font-bold text-white transition hover:bg-daet-ink"
          >
            Scan tickets
          </Link>
        </div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-4 text-center">
            <p className="text-3xl font-black text-daet-ink">
              {assignedTours?.length || 0}
            </p>
            <p className="text-xs text-daet-ink/70">Total Assigned</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
            <p className="text-3xl font-black text-emerald-900">{upcomingTours.length}</p>
            <p className="text-xs text-emerald-900">Upcoming</p>
          </div>
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-center">
            <p className="text-3xl font-black text-blue-900">{completedTours.length}</p>
            <p className="text-xs text-blue-900">Completed</p>
          </div>
        </div>

        {/* Upcoming Tours */}
        {upcomingTours.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-black text-daet-ink">Upcoming Tours</h2>
            <div className="space-y-4">
              {upcomingTours.map((booking) => {
                const pkg = Array.isArray(booking.tours_packages)
                  ? booking.tours_packages[0]
                  : booking.tours_packages;

                const operator = Array.isArray(pkg?.tours_operators)
                  ? pkg.tours_operators[0]
                  : pkg?.tours_operators;

                return (
                  <div
                    key={booking.id}
                    className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6"
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

                      {/* Tour Details */}
                      <div className="flex-1">
                        <div className="mb-3 flex items-start justify-between gap-4">
                          <div>
                            <h3 className="text-xl font-black text-daet-ink">
                              {pkg?.title || "Tour Package"}
                            </h3>
                            <p className="mt-1 text-sm text-daet-ink/70">
                              <LineIcon name="pin" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /> {pkg?.location_name || "Location"}
                            </p>
                          </div>
                          <span className="rounded-full bg-emerald-100 px-4 py-1 text-xs font-bold text-emerald-800">
                            Upcoming
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                          <div>
                            <p className="text-daet-ink/70">Tour Date</p>
                            <p className="font-bold text-daet-ink">
                              {new Date(booking.tour_date).toLocaleDateString("en-US", {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                              })}
                            </p>
                          </div>
                          <div>
                            <p className="text-daet-ink/70">Participants</p>
                            <p className="font-bold text-daet-ink">{booking.number_of_pax} pax</p>
                          </div>
                          <div>
                            <p className="text-daet-ink/70">Operator</p>
                            <p className="font-bold text-daet-ink">
                              {operator?.business_name || "N/A"}
                            </p>
                          </div>
                          <div>
                            <p className="text-daet-ink/70">Reference</p>
                            <p className="font-bold text-daet-forest">
                              {booking.booking_reference}
                            </p>
                          </div>
                        </div>

                        {operator?.contact_phone && (
                          <div className="mt-3 text-sm">
                            <span className="text-daet-ink/70">Operator Contact: </span>
                            <span className="font-bold text-daet-ink">
                              {operator.contact_phone}
                            </span>
                          </div>
                        )}

                        <Link
                          href={`/tours/guide/tours/${booking.id}/roster`}
                          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-daet-forest/30 bg-white px-5 text-sm font-bold text-daet-leaf transition hover:bg-daet-forest/5"
                        >
                          {booking.tour_date === today ? "Guest list & check-in" : "Guest list"}
                        </Link>
                        <SwapRequest
                          bookingId={booking.id}
                          reference={booking.booking_reference}
                          guides={pickers.get(booking.tour_date) ?? []}
                          latest={latestSwap.get(booking.id) ?? null}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Completed Tours */}
        {completedTours.length > 0 && (
          <section>
            <h2 className="mb-4 text-2xl font-black text-daet-ink">Completed Tours</h2>
            <div className="space-y-4">
              {completedTours.map((booking) => {
                const pkg = Array.isArray(booking.tours_packages)
                  ? booking.tours_packages[0]
                  : booking.tours_packages;

                return (
                  <div
                    key={booking.id}
                    className="rounded-2xl bg-white p-6"
                  >
                    <div className="flex gap-6">
                      {pkg?.cover_image_url && (
                        <img
                          src={pkg.cover_image_url}
                          alt={pkg.title}
                          className="h-24 w-32 flex-shrink-0 rounded-2xl object-cover"
                        />
                      )}
                      <div className="flex-1">
                        <h3 className="text-lg font-black text-daet-ink">
                          {pkg?.title || "Tour Package"}
                        </h3>
                        <p className="mt-1 text-sm text-daet-ink/70">
                          {new Date(booking.tour_date).toLocaleDateString("en-US", {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })}{" "}
                          • {booking.number_of_pax} pax • {booking.booking_reference}
                        </p>
                      </div>
                      <span className="self-start rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-900">
                        Completed
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Empty State */}
        {(!assignedTours || assignedTours.length === 0) && (
          <div className="rounded-2xl bg-white p-12 text-center">
            <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-daet-sand text-4xl">
              <LineIcon name="calendar" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" />
            </div>
            <h2 className="text-xl font-black text-daet-ink">No assigned tours yet</h2>
            <p className="mt-2 text-sm text-daet-ink/70">
              Operators will assign you to tours once bookings are confirmed.
            </p>
          </div>
        )}
      </div>
    </PageFrame>
  );
}
