import Link from "next/link";
import { redirect } from "next/navigation";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { DashboardHeader } from "@/components/ui/dashboard-header";
import { canAccessOperatorDashboard } from "@/lib/tours/operator-access";
import {
  OPERATOR_OWN_STATUS_SELECT,
  OPERATOR_TABLE,
  OPERATOR_USER_ID_COLUMN,
} from "@/lib/tours/operator-contract";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listOperatorPackages } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ submitted?: string }>;

export default async function OperatorPackagesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">
          Configure Supabase before managing packages.
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

  if (!session.user)
    redirect(`/login?next=${encodeURIComponent("/tours/operator/packages")}`);

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
  const { data: operator, error } = await supabase
    .from("tours_operators")
    .select("id, accreditation_status")
    .eq("profile_id", session.user.id)
    .maybeSingle();

  if (error || !operator) {
    return (
      <PageFrame>
        <Notice variant="error" title="Could not verify accreditation">
          Your operator status could not be checked.
        </Notice>
      </PageFrame>
    );
  }

  if (operator.accreditation_status !== "approved") redirect("/tours/operator/pending");
  if (!canAccessOperatorDashboard(session.role, operator.accreditation_status)) {
    return (
      <PageFrame>
        <Notice variant="error" title="Access denied">
          Your accreditation and account role do not match.
        </Notice>
      </PageFrame>
    );
  }

  const packagesResult = await listOperatorPackages();
  const packages = packagesResult.success ? packagesResult.data : [];


  const params = await searchParams;
  const justSubmitted = params.submitted === "true";

  return (
    <PageFrame>
      <DashboardHeader role="operator" />
      
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
          <div className="flex-1">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-daet-leaf">
              Package management
            </p>
            <h1 className="mt-2 text-3xl font-black text-daet-ink">Your packages</h1>
            <p className="mt-2 text-sm leading-6 text-daet-ink/65">
              Create and manage tour packages for tourists to book.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/tours/operator/packages/create"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-daet-forest px-6 text-sm font-black text-white transition hover:bg-daet-ink"
            >
              + Create package
            </Link>
          </div>
        </div>

        {justSubmitted && (
          <Notice variant="success" className="mt-6">
            Package submitted for Tourism Office review! You'll be notified once it's approved.
          </Notice>
        )}

        {!packages || packages.length === 0 ? (
          <section className="mt-8 rounded-3xl border border-daet-ink/10 bg-white px-6 py-14 text-center shadow-sm">
            <span
              className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-daet-sand text-2xl"
              aria-hidden="true"
            >
              📦
            </span>
            <h2 className="mt-4 text-xl font-black text-daet-ink">No packages yet</h2>
            <p className="mt-2 text-sm text-daet-ink/70">
              Create your first tour package to start receiving bookings.
            </p>
            <Link
              href="/tours/operator/packages/create"
              className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-daet-forest px-8 text-sm font-black text-white transition hover:bg-daet-ink"
            >
              Create first package
            </Link>
          </section>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {packages.map((pkg) => (
              <article
                key={pkg.id}
                className="overflow-hidden rounded-3xl border border-daet-ink/10 bg-white shadow-sm transition hover:shadow-md"
              >
                {/* Cover Image */}
                <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-daet-forest to-daet-leaf">
                  {pkg.cover_image_url ? (
                    <img
                      src={pkg.cover_image_url}
                      alt={pkg.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-4xl text-white/20">
                      📷
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="flex-1 font-black text-daet-ink">{pkg.title}</h3>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        pkg.status === "published"
                          ? "bg-emerald-100 text-emerald-800"
                          : pkg.status === "pending_review"
                            ? "bg-amber-100 text-amber-900"
                            : pkg.status === "archived"
                              ? "bg-gray-100 text-gray-800"
                              : "bg-daet-sand text-daet-ink/70"
                      }`}
                    >
                      {pkg.status === "published"
                        ? "Published"
                        : pkg.status === "pending_review"
                          ? "Pending"
                          : pkg.status === "archived"
                            ? "Archived"
                            : "Draft"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-daet-ink/70">📍 {pkg.location_name}</p>
                  <p className="mt-1 text-xs text-daet-ink/70">
                    Updated {new Date(pkg.updated_at).toLocaleDateString()}
                  </p>
                  <Link
                    href={`/tours/operator/packages/${pkg.id}`}
                    className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-full bg-daet-forest/10 text-sm font-bold text-daet-forest transition hover:bg-daet-forest/20"
                  >
                    View details →
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </PageFrame>
  );
}
