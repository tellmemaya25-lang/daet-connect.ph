import { durationText } from "@/lib/tours/duration";
import { LineIcon } from "@/components/ui/icons";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bookableDates, type AvailabilityRow } from "@/lib/tours/availability";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { BookingForm } from "./booking-form";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { toOfficialRates, toPickupShortcuts, toPickupVehicles } from "@/lib/tours/door-pickup";
import { sweepExpiredHolds } from "@/lib/tours/booking-holds";


type PageProps = {
  params: Promise<{ id: string }>;
  /** From the trip planner's Book button: the plan day and group size. */
  searchParams: Promise<{ date?: string | string[]; pax?: string | string[] }>;
};

export default async function BookPackagePage({ params, searchParams }: PageProps) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">
          Configure Supabase to book packages.
        </Notice>
      </PageFrame>
    );
  }

  const { id } = await params;
  const query = await searchParams;
  const prefill = { date: typeof query.date === "string" ? query.date : undefined, pax: typeof query.pax === "string" ? query.pax : undefined };
  const back = new URLSearchParams(Object.entries(prefill).filter((e): e is [string, string] => typeof e[1] === "string"));
  const session = await getAuthenticatedSession();
  if (!session.user) {
    redirect(`/login?next=${encodeURIComponent(`/tours/packages/${id}/book${back.size ? `?${back}` : ""}`)}`);
  }
  if (session.error || !session.role) {
    return (
      <PageFrame>
        <Notice variant="error" title="Your account role could not be verified">
          Booking is available only to tourist accounts. Please try again later or contact support if this continues.
        </Notice>
      </PageFrame>
    );
  }
  if (session.role !== "tourist") {
    redirect(session.role === "admin" ? "/tours/admin" : "/dashboard");
  }

  const user = session.user;
  const supabase = await createSupabaseServerClient();

  // An unpaid hold that ran out should not keep blocking this tourist — or
  // anybody else — from booking. Cheap, best-effort, and never blocks the page.
  await sweepExpiredHolds(supabase);

  // Fetch package details with price variants
  const { data: pkg, error } = await supabase
    .from("tours_packages")
    .select(
      `
      id,
      title,
      description,
      location_name,
      duration_value,
      duration_type,
      meeting_time,
      cover_image_url,
      meeting_point_name,
      meeting_lat,
      meeting_lng,
      status,
      tours_package_price_variants(
        id,
        variant_name,
        price_per_pax,
        flat_price,
        min_pax,
        max_pax,
        is_default
      ),
      tours_operators(
        business_name
      )
    `,
    )
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();

  if (error || !pkg) {
    console.error("Package fetch error:", error);
    notFound();
  }

  // Get user profile for pre-filling form
  const today = toManilaDateKey(new Date());

  // The tourist's own diary, so the form can say before they submit that the
  // date they picked runs into a tour they have already paid for (20261221).
  // Their active bookings, then the timings of the tours those bookings are for.
  const { data: diaryRows } = await supabase
    .from("tours_bookings")
    .select("id, package_id, tour_date, status")
    .eq("user_id", user.id)
    .in("status", ["pending", "confirmed"])
    .gte("tour_date", today)
    .order("tour_date", { ascending: true });

  const diaryPackageIds = [...new Set((diaryRows ?? []).map((row) => row.package_id).filter((id): id is string => Boolean(id)))];
  const { data: diaryPackages } = diaryPackageIds.length
    ? await supabase
        .from("tours_packages")
        .select("id, title, duration_type, duration_value, meeting_time")
        .in("id", diaryPackageIds)
    : { data: [] as { id: string; title: string | null; duration_type: string | null; duration_value: number | null; meeting_time: string | null }[] };

  const diaryPackageById = new Map((diaryPackages ?? []).map((row) => [row.id, row]));
  const diary = (diaryRows ?? []).flatMap((row) => {
    const pkgRow = row.package_id ? diaryPackageById.get(row.package_id) : undefined;
    if (!pkgRow) return [];
    return [{
      id: row.id,
      package_id: row.package_id,
      tour_date: row.tour_date,
      status: row.status,
      title: pkgRow.title ?? "your booking",
      duration_type: pkgRow.duration_type,
      duration_value: pkgRow.duration_value,
      meeting_time: pkgRow.meeting_time,
    }];
  });

  const [{ data: profile }, { data: availabilityRows }, { count: openDateCount }, { data: shortcutRows }, { data: vehicleRows }, { data: rateRows }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("tours_package_availability")
      .select("available_date, capacity_total, capacity_booked")
      .eq("package_id", pkg.id)
      .gte("available_date", today)
      .order("available_date", { ascending: true }),
    // Any open date (past ones included) switches the package to "open dates only".
    supabase.from("tours_package_availability").select("id", { count: "exact", head: true }).eq("package_id", pkg.id),
    // Shortcuts for the pickup pin: Daet places whose map pin was checked.
    supabase.from("tours_attractions").select("id, name, latitude, longitude").eq("is_active", true).eq("location_verified", true).ilike("municipality", "%daet%").not("latitude", "is", null).order("name").limit(8),
    supabase.from("tours_package_pickup_vehicles").select("id, vehicle, label, seats, max_km, is_active").eq("package_id", pkg.id).order("sort_order"),
    supabase.from("tours_official_pickup_rates").select("vehicle, base_fee, per_km_per_person, source, source_url, effective_on, checked_on"),
  ]);
  const usesOpenDates = (openDateCount ?? 0) > 0;

  return (
    <PageFrame>
      <div className="mx-auto max-w-4xl">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm text-daet-ink/70">
          <Link href="/tours/browse" className="hover:text-daet-forest dark:hover:text-blue-300">
            Browse packages
          </Link>
          <span className="mx-2">→</span>
          <Link href={`/tours/packages/${pkg.id}`} className="hover:text-daet-forest dark:hover:text-blue-300">
            {pkg.title}
          </Link>
          <span className="mx-2">→</span>
          <span className="text-daet-ink">Book</span>
        </nav>

        {/* Package Header */}
        <div className="mb-8 rounded-2xl card-edge bg-surface p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
            {pkg.cover_image_url && (
              <img
                src={pkg.cover_image_url}
                alt={pkg.title}
                className="h-48 w-full rounded-2xl object-cover sm:h-32 sm:w-48 sm:shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <h1 className="display-2 break-words text-daet-ink">{pkg.title}</h1>
              <p className="mt-2 text-sm text-daet-ink/70">
                <LineIcon name="pin" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /> {pkg.location_name} · <LineIcon name="clock" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /> {durationText(Number(pkg.duration_value), pkg.duration_type) ?? ""}
              </p>
              {Array.isArray(pkg.tours_operators) && pkg.tours_operators[0] && (
                <p className="mt-1 text-sm font-bold text-daet-forest dark:text-blue-300">
                  by {pkg.tours_operators[0].business_name}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Booking Form */}
        <BookingForm
          packageId={pkg.id}
          tourTiming={{
            duration_type: pkg.duration_type,
            duration_value: pkg.duration_value,
            meeting_time: pkg.meeting_time,
          }}
          diary={diary}
          priceVariants={pkg.tours_package_price_variants || []}
          pickupShortcuts={toPickupShortcuts(shortcutRows)}
          meetingPoint={pkg.meeting_point_name?.trim() || null}
          pickupVehicles={toPickupVehicles(vehicleRows, toOfficialRates(rateRows))}
          meetingLatLng={pkg.meeting_lat != null && pkg.meeting_lng != null ? { lat: Number(pkg.meeting_lat), lng: Number(pkg.meeting_lng) } : null}
          prefill={prefill}
          dateOptions={usesOpenDates ? bookableDates((availabilityRows ?? []) as AvailabilityRow[], today) : null}
          userProfile={{
            fullName: profile?.full_name || "",
            email: user.email ?? "",
          }}
        />
      </div>
    </PageFrame>
  );
}
