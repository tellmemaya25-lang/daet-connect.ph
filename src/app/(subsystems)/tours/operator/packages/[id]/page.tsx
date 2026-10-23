import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { canAccessOperatorDashboard } from "@/lib/tours/operator-access";
import {
  OPERATOR_TABLE,
  OPERATOR_USER_ID_COLUMN,
  OPERATOR_OWN_STATUS_SELECT,
} from "@/lib/tours/operator-contract";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function OperatorPackageDetailPage({ params }: PageProps) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">
          Configure Supabase to view package details.
        </Notice>
      </PageFrame>
    );
  }

  let session;
  try {
    session = await getAuthenticatedSession();
  } catch {
    session = { user: null, role: null, error: "Supabase could not be reached." };
  }

  if (!session.user) {
    redirect(`/login?next=${encodeURIComponent("/tours/operator/packages")}`);
  }

  if (session.error || !session.role) {
    return (
      <PageFrame>
        <Notice variant="error" title="Account verification failed">
          {session.error ?? "Your role could not be verified."}
        </Notice>
      </PageFrame>
    );
  }

  const supabase = await createSupabaseServerClient();

  // Verify operator status
  const { data: operator, error: opError } = await supabase
    .from("tours_operators")
    .select("id, accreditation_status")
    .eq("profile_id", session.user.id)
    .maybeSingle();

  if (opError || !operator) {
    return (
      <PageFrame>
        <Notice variant="error" title="Could not verify accreditation">
          Your operator status could not be checked.
        </Notice>
      </PageFrame>
    );
  }

  if (operator.accreditation_status !== "approved") {
    redirect("/tours/operator/pending");
  }

  if (!canAccessOperatorDashboard(session.role, operator.accreditation_status)) {
    return (
      <PageFrame>
        <Notice variant="error" title="Access denied">
          Your accreditation and account role do not match.
        </Notice>
      </PageFrame>
    );
  }

  const { id } = await params;

  // Fetch package with all details - verify ownership
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
      cover_image_url,
      status,
      created_at,
      updated_at,
      operator_id,
      rejection_reason,
      tours_package_price_variants(
        id,
        variant_name,
        price_per_pax,
        flat_price,
        min_pax,
        max_pax,
        is_default
      ),
      tours_package_inclusions(
        id,
        item_text,
        is_included
      ),
      tours_package_stops(
        id,
        location_name,
        description,
        latitude,
        longitude,
        stop_order
      ),
      tours_package_gallery(
        id,
        image_url,
        caption,
        display_order
      )
    `,
    )
    .eq("id", id)
    .eq("operator_id", operator.id)
    .maybeSingle();

  if (error) {
    console.error("Package detail error:", error);
    return (
      <PageFrame>
        <Notice variant="error" title="Could not load package">
          {error.message}
        </Notice>
      </PageFrame>
    );
  }

  if (!pkg) {
    notFound();
  }

  // Get default price or first price variant
  const defaultVariant =
    pkg.tours_package_price_variants?.find((v: any) => v.is_default) ||
    pkg.tours_package_price_variants?.[0];

  const displayPrice = defaultVariant?.price_per_pax || defaultVariant?.flat_price || 0;
  const priceLabel = defaultVariant?.price_per_pax ? "per person" : "flat rate";

  // Sort inclusions
  const included = pkg.tours_package_inclusions?.filter((i: any) => i.is_included) || [];
  const excluded = pkg.tours_package_inclusions?.filter((i: any) => !i.is_included) || [];

  // Sort stops by order
  const stops = (pkg.tours_package_stops || []).sort(
    (a: any, b: any) => a.stop_order - b.stop_order,
  );

  // Sort gallery by display order
  const gallery = (pkg.tours_package_gallery || []).sort(
    (a: any, b: any) => a.display_order - b.display_order,
  );

  // Status badge
  const getStatusBadge = () => {
    switch (pkg.status) {
      case "published":
        return "bg-emerald-100 text-emerald-800";
      case "pending_review":
        return "bg-amber-100 text-amber-900";
      case "rejected":
        return "bg-rose-100 text-rose-800";
      default:
        return "bg-daet-sand text-daet-ink/60";
    }
  };

  const getStatusLabel = () => {
    switch (pkg.status) {
      case "published":
        return "Published";
      case "pending_review":
        return "Pending Review";
      case "rejected":
        return "Rejected";
      default:
        return "Draft";
    }
  };

  return (
    <PageFrame>
      <div className="mx-auto max-w-7xl">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm text-daet-ink/60">
          <Link href="/tours/operator/packages" className="hover:text-daet-forest">
            My packages
          </Link>
          <span className="mx-2">→</span>
          <span className="text-daet-ink">{pkg.title}</span>
        </nav>

        {/* Header with status */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-daet-ink">{pkg.title}</h1>
            <p className="mt-1 text-sm text-daet-ink/60">
              Last updated: {new Date(pkg.updated_at).toLocaleDateString()}
            </p>
          </div>
          <span className={`rounded-full px-4 py-2 text-sm font-bold ${getStatusBadge()}`}>
            {getStatusLabel()}
          </span>
        </div>

        {/* Rejection reason */}
        {pkg.status === "rejected" && pkg.rejection_reason && (
          <Notice variant="error" className="mb-6" title="Package rejected">
            {pkg.rejection_reason}
          </Notice>
        )}

        {/* Pending review notice */}
        {pkg.status === "pending_review" && (
          <Notice variant="info" className="mb-6">
            Your package is under review by the Tourism Office. You'll be notified once it's
            approved.
          </Notice>
        )}

        {/* Action buttons */}
        <div className="mb-6 flex flex-wrap gap-3">
          <Link
            href={`/tours/operator/packages/${pkg.id}/edit`}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-daet-forest px-6 text-sm font-black text-white transition hover:bg-daet-ink"
          >
            Edit package
          </Link>
          <Link
            href={`/tours/operator/packages/${pkg.id}/availability`}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-daet-forest/30 bg-white px-6 text-sm font-bold text-daet-forest transition hover:bg-daet-forest/5"
          >
            Dates &amp; seats
          </Link>
          {pkg.status === "published" && (
            <Link
              href={`/tours/packages/${pkg.id}`}
              target="_blank"
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-daet-ink/20 bg-white px-6 text-sm font-bold text-daet-ink transition hover:bg-daet-sand"
            >
              View public page →
            </Link>
          )}
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Main content */}
          <div className="lg:col-span-2">
            {/* Cover image */}
            {pkg.cover_image_url ? (
              <div className="aspect-video overflow-hidden rounded-3xl bg-daet-sand">
                <img
                  src={pkg.cover_image_url}
                  alt={pkg.title}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="aspect-video rounded-3xl bg-daet-sand" />
            )}

            {/* Basic info */}
            <div className="mt-6 rounded-2xl border border-daet-ink/10 bg-white p-6">
              <h2 className="font-black text-daet-ink">Basic information</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="font-bold text-daet-ink/60">Location</dt>
                  <dd className="mt-1 text-daet-ink">📍 {pkg.location_name}</dd>
                </div>
                <div>
                  <dt className="font-bold text-daet-ink/60">Duration</dt>
                  <dd className="mt-1 text-daet-ink">
                    ⏱️ {pkg.duration_value}{" "}
                    {pkg.duration_type === "hours" ? "hours" : "days"}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-daet-ink/60">Description</dt>
                  <dd className="mt-1 leading-7 text-daet-ink">
                    {pkg.description || "No description provided."}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Pricing */}
            {pkg.tours_package_price_variants && pkg.tours_package_price_variants.length > 0 && (
              <div className="mt-6 rounded-2xl border border-daet-ink/10 bg-white p-6">
                <h2 className="font-black text-daet-ink">Pricing variants</h2>
                <div className="mt-4 space-y-3">
                  {pkg.tours_package_price_variants.map((variant: any) => (
                    <div
                      key={variant.id}
                      className="flex items-center justify-between rounded-xl border border-daet-ink/10 p-4"
                    >
                      <div>
                        <p className="font-bold text-daet-ink">
                          {variant.variant_name}
                          {variant.is_default && (
                            <span className="ml-2 text-xs text-daet-leaf">(Default)</span>
                          )}
                        </p>
                        {(variant.min_pax || variant.max_pax) && (
                          <p className="mt-1 text-xs text-daet-ink/60">
                            {variant.min_pax && `Min: ${variant.min_pax} pax`}
                            {variant.min_pax && variant.max_pax && " · "}
                            {variant.max_pax && `Max: ${variant.max_pax} pax`}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-black text-daet-ink">
                          ₱
                          {(
                            variant.price_per_pax ||
                            variant.flat_price ||
                            0
                          ).toLocaleString()}
                        </p>
                        <p className="text-xs text-daet-ink/60">
                          {variant.price_per_pax ? "per person" : "flat rate"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Inclusions */}
            {(included.length > 0 || excluded.length > 0) && (
              <div className="mt-6 rounded-2xl border border-daet-ink/10 bg-white p-6">
                <h2 className="font-black text-daet-ink">Inclusions</h2>

                {included.length > 0 && (
                  <>
                    <h3 className="mt-4 text-sm font-bold text-daet-ink/60">Included</h3>
                    <ul className="mt-2 space-y-2">
                      {included.map((item: any) => (
                        <li
                          key={item.id}
                          className="flex items-start gap-2 text-sm text-daet-ink/80"
                        >
                          <span className="text-green-600">✓</span>
                          <span>{item.item_text}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {excluded.length > 0 && (
                  <>
                    <h3 className="mt-4 text-sm font-bold text-daet-ink/60">Not included</h3>
                    <ul className="mt-2 space-y-2">
                      {excluded.map((item: any) => (
                        <li
                          key={item.id}
                          className="flex items-start gap-2 text-sm text-daet-ink/80"
                        >
                          <span className="text-red-600">✗</span>
                          <span>{item.item_text}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            {/* Itinerary */}
            {stops.length > 0 && (
              <div className="mt-6 rounded-2xl border border-daet-ink/10 bg-white p-6">
                <h2 className="font-black text-daet-ink">Itinerary stops</h2>
                <div className="mt-4 space-y-4">
                  {stops.map((stop: any, idx: number) => (
                    <div key={stop.id} className="flex gap-4">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-daet-leaf text-sm font-black text-white">
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-daet-ink">{stop.location_name}</h3>
                        {stop.description && (
                          <p className="mt-1 text-sm text-daet-ink/70">
                            {stop.description}
                          </p>
                        )}
                        {(stop.latitude || stop.longitude) && (
                          <p className="mt-1 text-xs text-daet-ink/50">
                            {stop.latitude}, {stop.longitude}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Gallery */}
            {gallery.length > 0 && (
              <div className="mt-6 rounded-2xl border border-daet-ink/10 bg-white p-6">
                <h2 className="font-black text-daet-ink">Photo gallery</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {gallery.map((img: any) => (
                    <div key={img.id} className="overflow-hidden rounded-2xl bg-daet-sand">
                      <img
                        src={img.image_url}
                        alt={img.caption || "Package photo"}
                        className="aspect-video w-full object-cover"
                      />
                      {img.caption && (
                        <p className="p-3 text-xs text-daet-ink/60">{img.caption}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar - Stats */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 rounded-3xl border border-daet-ink/10 bg-white p-6 shadow-lg">
              <h2 className="font-black text-daet-ink">Package stats</h2>

              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs text-daet-ink/60">Base price</p>
                  <p className="mt-1 text-2xl font-black text-daet-ink">
                    ₱{displayPrice.toLocaleString()}
                  </p>
                  <p className="text-xs text-daet-ink/60">{priceLabel}</p>
                </div>

                <div className="border-t border-daet-ink/10 pt-4">
                  <p className="text-xs text-daet-ink/60">Total bookings</p>
                  <p className="mt-1 text-2xl font-black text-daet-ink">0</p>
                </div>

                <div className="border-t border-daet-ink/10 pt-4">
                  <p className="text-xs text-daet-ink/60">Revenue</p>
                  <p className="mt-1 text-2xl font-black text-daet-ink">₱0</p>
                </div>

                <div className="border-t border-daet-ink/10 pt-4">
                  <p className="text-xs text-daet-ink/60">Average rating</p>
                  <p className="mt-1 text-2xl font-black text-daet-ink">—</p>
                </div>
              </div>

              {pkg.status === "draft" && (
                <Link
                  href={`/tours/operator/packages/${pkg.id}/edit`}
                  className="mt-6 flex min-h-10 w-full items-center justify-center rounded-full bg-daet-forest text-sm font-black text-white transition hover:bg-daet-ink"
                >
                  Complete & submit
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageFrame>
  );
}
