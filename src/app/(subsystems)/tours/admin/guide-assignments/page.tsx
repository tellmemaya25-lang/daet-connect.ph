import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { parseCoverage } from "@/lib/tours/guide-coverage";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";
import { PackageGuidesForm } from "./package-guides-form";
import { ProposeGuide } from "./propose-guide";

export const metadata = { title: "Guide assignments" };

const day = (key: string) => new Date(`${key}T00:00:00+08:00`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "Asia/Manila" });

export default async function GuideAssignmentsPage() {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next="/tours/admin/guide-assignments" />;

  const { data, error } = await admin.supabase.rpc("tours_admin_guide_coverage");
  const coverage = parseCoverage(data);
  const guideOptions = coverage.guides.map((g) => ({ id: g.id, name: g.name }));

  return (
    <PageFrame adminNav>
      <AdminPageHeading title="Guide assignments" backHref="/tours/admin" backLabel="Admin dashboard" />
      <p className="mb-6 max-w-3xl text-slate-600 dark:text-slate-400">
        Each new booking is proposed a free guide automatically from the guides on its operator&apos;s team: first the guides chosen for that package, then the rest of the team, the least busy first. You can assign someone yourself below. Either way, the operator approves the guide before the tour.
      </p>

      {error ? (
        <Notice variant="error" title="Guide assignments could not be loaded">
          {error.code === "PGRST202" ? "The database update for guide assignments has not been applied yet." : "Please try again in a moment."}
        </Notice>
      ) : (
        <div className="space-y-8">
          <section aria-labelledby="waiting-heading">
            <h2 id="waiting-heading" className="mb-3 text-xl font-bold text-daet-ink">
              Upcoming bookings without a guide ({coverage.bookings.length})
            </h2>
            {coverage.bookings.length === 0 ? (
              <p className="rounded-2xl bg-surface p-4 text-slate-600 dark:text-slate-400">Every upcoming booking has a guide.</p>
            ) : (
              <ul className="space-y-3">
                {coverage.bookings.map((b) => (
                  <li key={b.id} className="grid gap-3 rounded-2xl card-edge bg-surface p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                    <div className="min-w-0">
                      <p className="font-bold text-daet-ink">
                        {b.title} · {day(b.date)}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {b.reference} · {b.operator} · {b.pax} guest{b.pax === 1 ? "" : "s"} · {b.status}
                      </p>
                      <p className="mt-1 text-sm text-daet-ink">
                        {b.proposal === "proposed"
                          ? `${b.proposedBy === "admin" ? "Assigned by the Tourism Office" : "Picked automatically"}: ${b.proposedGuideName ?? "a guide"}, waiting for the operator to approve.`
                          : b.proposal === "none_available"
                            ? "No free guide on the operator’s team at that time."
                            : "No guide proposed yet."}
                      </p>
                    </div>
                    <ProposeGuide bookingId={b.id} guides={guideOptions.filter((g) => b.teamIds.includes(g.id))} current={b.proposedGuideId} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="package-guides-heading">
            <h2 id="package-guides-heading" className="mb-1 text-xl font-bold text-daet-ink">
              Guides for each package
            </h2>
            <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
              These guides are proposed first for the package&apos;s bookings. When all of them are busy, another free guide from the operator&apos;s team is proposed instead.
            </p>
            {coverage.packages.length === 0 ? (
              <p className="rounded-2xl bg-surface p-4 text-slate-600 dark:text-slate-400">No published packages yet.</p>
            ) : (
              <div className="space-y-3">
                {coverage.packages.map((p) => (
                  <PackageGuidesForm key={p.id} pkg={p} guides={guideOptions.filter((g) => p.teamIds.includes(g.id))} />
                ))}
              </div>
            )}
          </section>

        </div>
      )}
    </PageFrame>
  );
}
