import { notFound, redirect } from "next/navigation";
import { DashboardHeader } from "@/components/ui/dashboard-header";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/tours/operator-access";
import { loadTripDetails } from "@/lib/tours/trip-details";
import { TripDetailsForm } from "./trip-details-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trip details" };

/**
 * Itinerary, optional extras, child and group pricing, reservation fee and
 * cancellation terms for one package. Drafts and rejected packages can change
 * everything; published ones only the itinerary and notes.
 */
export default async function TripDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">Configure Supabase to edit packages.</Notice>
      </PageFrame>
    );
  }
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/tours/operator/packages/${id}/details`)}`);

  const { data: pkg } = await supabase
    .from("tours_packages")
    .select("id, title, status, duration_value, duration_type, tours_operators!inner ( profile_id ), tours_package_price_variants ( id, variant_name, price_per_pax, flat_price, is_default )")
    .eq("id", id)
    .eq("tours_operators.profile_id", user.id)
    .maybeSingle();
  if (!pkg) notFound();

  const details = await loadTripDetails(supabase, pkg.id);
  const status = String(pkg.status);
  const full = status === "draft" || status === "rejected";
  const readOnly = status === "pending_review" || status === "archived";
  const days = pkg.duration_type === "days" ? Math.max(1, Math.min(14, Number(pkg.duration_value) || 1)) : 1;
  const variants = ((pkg.tours_package_price_variants ?? []) as Array<{ id: string; variant_name: string; price_per_pax: number | null; flat_price: number | null; is_default: boolean }>).sort(
    (a, b) => Number(b.is_default) - Number(a.is_default),
  );

  return (
    <PageFrame>
      <div className="mx-auto max-w-3xl">
        <DashboardHeader backHref={`/tours/operator/packages/${pkg.id}`} backLabel={pkg.title} title="Trip details" description="Day-by-day plan, optional extras, child and group prices, and your reservation and cancellation terms." />
        {readOnly ? (
          <Notice variant="info" className="mb-6" title={status === "archived" ? "This package is archived" : "Waiting for the Tourism Office"}>
            {status === "archived" ? "Archived packages can't be changed." : "You can change trip details again once the review is done."}
          </Notice>
        ) : !full ? (
          <Notice variant="info" className="mb-6" title="This package is published">
            You can change the itinerary, things to bring and notes now. Prices, extras and terms change through review: ask the Tourism Office, or copy the package to a new draft.
          </Notice>
        ) : null}
        <TripDetailsForm packageId={pkg.id} details={details} variants={variants} days={days} full={full} readOnly={readOnly} />
      </div>
    </PageFrame>
  );
}
