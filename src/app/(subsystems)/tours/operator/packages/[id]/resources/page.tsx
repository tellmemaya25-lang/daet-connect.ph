import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { OPERATOR_TABLE, OPERATOR_USER_ID_COLUMN } from "@/lib/tours/operator-contract";
import { isResourceKind, type Resource, type ResourceNeed } from "@/lib/tours/operator-resources";
import { NeedsForm } from "./needs-form";

/** What one tour takes from the fleet (20261223). */
export default async function PackageResourcesPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">
          Configure Supabase to manage a tour&apos;s needs.
        </Notice>
      </PageFrame>
    );
  }

  const { id } = await params;
  let session;
  try {
    session = await getAuthenticatedSession();
  } catch {
    session = { user: null, role: null, error: "Supabase could not be reached." };
  }
  if (!session.user) {
    redirect(`/login?next=${encodeURIComponent(`/tours/operator/packages/${id}/resources`)}`);
  }

  const supabase = await createSupabaseServerClient();
  const { data: operator } = await supabase
    .from(OPERATOR_TABLE)
    .select("id")
    .eq(OPERATOR_USER_ID_COLUMN, session.user.id)
    .maybeSingle();
  if (!operator) {
    return (
      <PageFrame>
        <Notice variant="error" title="Operator profile not found">
          You need an operator account to manage a tour&apos;s needs.
        </Notice>
      </PageFrame>
    );
  }

  const { data: pkg } = await supabase
    .from("tours_packages")
    .select("id, title, operator_id, duration_type, duration_value, meeting_time")
    .eq("id", id)
    .maybeSingle();
  if (!pkg || pkg.operator_id !== operator.id) notFound();

  const [{ data: needRows }, { data: resourceRows }] = await Promise.all([
    supabase.from("tours_package_resources").select("kind, seats_per_pax, units_per_booking").eq("package_id", pkg.id),
    supabase
      .from("tours_operator_resources")
      .select("kind")
      .eq("operator_id", operator.id)
      .eq("is_active", true),
  ]);

  const needs: ResourceNeed[] = (needRows ?? []).flatMap((row) =>
    isResourceKind(row.kind)
      ? [{ kind: row.kind, seats_per_pax: row.seats_per_pax ?? 1, units_per_booking: row.units_per_booking ?? 0 }]
      : [],
  );
  // Only kinds the operator actually owns can be chosen.
  const owned = [...new Set((resourceRows ?? []).flatMap((row) => (isResourceKind(row.kind) ? [row.kind] : [])))];
  const ownedResources: Resource[] = owned.map((kind) => ({ id: kind, kind, name: kind, seats: 0, units: 0, note: null, is_active: true }));

  return (
    <PageFrame>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <Link
            href="/tours/operator/resources"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-daet-ink/70 transition hover:text-daet-ink"
          >
            ← Back to your fleet
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="display-2 text-daet-ink">{pkg.title}</h1>
          <p className="mt-2 text-sm text-daet-ink/70">
            What this tour takes from your fleet. Bookings are refused when nothing is free, on every day the
            tour runs — a 3-day trip holds the boat for all three.
          </p>
        </div>

        {owned.length === 0 ? (
          <Notice variant="warning" title="Add something to your fleet first">
            You have no active boats or vans listed, so there is nothing for this tour to use.{" "}
            <Link href="/tours/operator/resources" className="font-bold underline">
              Add one
            </Link>
            , then come back.
          </Notice>
        ) : (
          <NeedsForm packageId={pkg.id} owned={ownedResources} needs={needs} />
        )}
      </div>
    </PageFrame>
  );
}
