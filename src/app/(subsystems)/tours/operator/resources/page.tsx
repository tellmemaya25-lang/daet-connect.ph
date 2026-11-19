import { redirect } from "next/navigation";
import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { OPERATOR_TABLE, OPERATOR_USER_ID_COLUMN } from "@/lib/tours/operator-contract";
import { isResourceKind, type Resource } from "@/lib/tours/operator-resources";
import { FleetForm } from "./fleet-form";

/**
 * An operator's fleet (20261223). A tour that needs a boat cannot be booked when
 * every boat is out, which is what stops two tours claiming the same one.
 */
export default async function OperatorResourcesPage() {
  if (!isSupabaseConfigured()) {
    return (
      <PageFrame>
        <Notice variant="warning" title="Supabase setup needed">
          Configure Supabase to manage your fleet.
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
    redirect(`/login?next=${encodeURIComponent("/tours/operator/resources")}`);
  }

  const supabase = await createSupabaseServerClient();
  const { data: operator } = await supabase
    .from(OPERATOR_TABLE)
    .select("id, business_name, accreditation_status")
    .eq(OPERATOR_USER_ID_COLUMN, session.user.id)
    .maybeSingle();

  if (!operator) {
    return (
      <PageFrame>
        <Notice variant="error" title="Operator profile not found">
          You need an operator account to manage a fleet.
        </Notice>
      </PageFrame>
    );
  }
  if (operator.accreditation_status !== "approved") {
    return (
      <PageFrame>
        <Notice variant="warning" title="Accreditation pending">
          Your operator account must be approved before you can manage your fleet.
        </Notice>
      </PageFrame>
    );
  }

  const [{ data: rows }, { data: packages }] = await Promise.all([
    supabase
      .from("tours_operator_resources")
      .select("id, kind, name, seats, units, note, is_active")
      .eq("operator_id", operator.id)
      .order("sort_order")
      .order("name"),
    // Which tours already say what they need, so the page can point at the rest.
    supabase
      .from("tours_packages")
      .select("id, title, status")
      .eq("operator_id", operator.id)
      .eq("status", "published")
      .order("title"),
  ]);

  const resources: Resource[] = (rows ?? []).flatMap((row) =>
    isResourceKind(row.kind)
      ? [{
          id: row.id,
          kind: row.kind,
          name: row.name,
          seats: row.seats ?? 0,
          units: row.units ?? 1,
          note: row.note,
          is_active: row.is_active ?? true,
        }]
      : [],
  );

  const { data: needRows } = await supabase
    .from("tours_package_resources")
    .select("package_id")
    .in("package_id", (packages ?? []).map((pkg) => pkg.id));
  const packagesWithNeeds = new Set((needRows ?? []).map((row) => row.package_id));

  return (
    <PageFrame>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <Link
            href="/tours/operator/dashboard"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-daet-ink/70 transition hover:text-daet-ink"
          >
            ← Back to Dashboard
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="display-2 text-daet-ink">Boats, vans and drivers</h1>
          <p className="mt-2 max-w-2xl text-sm text-daet-ink/70">
            Tell us what you own, then say which tours need it. A tour that needs a boat can&apos;t be booked
            when every boat is already out — that is what stops two tours being sold for the same one.
          </p>
        </div>

        <FleetForm resources={resources} />

        <section className="mt-10 rounded-2xl card-edge bg-surface p-6">
          <h2 className="text-xl font-bold text-daet-ink">Which tours need it</h2>
          <p className="mt-1 text-sm text-daet-ink/70">
            A tour with nothing listed keeps selling the seats you opened for each date, as before.
          </p>
          {(packages ?? []).length === 0 ? (
            <p className="mt-4 text-sm text-daet-ink/70">You have no published tours yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {(packages ?? []).map((pkg) => (
                <li key={pkg.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="font-bold text-daet-ink">{pkg.title}</span>
                  <span className="flex items-center gap-3">
                    <span className={`text-sm ${packagesWithNeeds.has(pkg.id) ? "text-green-700 dark:text-green-300" : "text-daet-ink/60"}`}>
                      {packagesWithNeeds.has(pkg.id) ? "Needs listed" : "Sells seats per date"}
                    </span>
                    <Link
                      href={`/tours/operator/packages/${pkg.id}/resources`}
                      className="text-sm font-bold text-blue-700 underline dark:text-blue-300"
                    >
                      {packagesWithNeeds.has(pkg.id) ? "Change" : "Say what it needs"}
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageFrame>
  );
}
