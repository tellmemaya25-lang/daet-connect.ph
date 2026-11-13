import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { packagesWithoutGuides, parseCoverage, uncoveredAreas } from "@/lib/tours/guide-coverage";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";
import { GuideAreasForm } from "./guide-areas-form";
import { PackageGuidesForm } from "./package-guides-form";
import { ProposeGuide } from "./propose-guide";

export const metadata = { title: "Guide assignments" };

const day = (key: string) => new Date(`${key}T00:00:00+08:00`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "Asia/Manila" });

export default async function GuideAssignmentsPage() {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next="/tours/admin/guide-assignments" />;

  const { data, error } = await admin.supabase.rpc("tours_admin_guide_coverage");
  const coverage = parseCoverage(data);
  const gaps = uncoveredAreas(coverage.areas);
  const unguided = packagesWithoutGuides(coverage.packages);
  const guideOptions = coverage.guides.map((g) => ({ id: g.id, name: g.name }));

  return (
    <PageFrame adminNav>
      <AdminPageHeading title="Guide assignments" backHref="/tours/admin" backLabel="Admin dashboard" />
      <p className="mb-6 max-w-3xl text-slate-600 dark:text-slate-400">
        Each new booking is proposed a free guide automatically: first the guides chosen for that package, then guides who serve the package&apos;s municipality, the least busy first. You can propose someone else; the operator approves before the guide is assigned.
      </p>

      {error ? (
        <Notice variant="error" title="Guide assignments could not be loaded">
          {error.code === "PGRST202" ? "The database update for guide areas has not been applied yet." : "Please try again in a moment."}
        </Notice>
      ) : (
        <div className="space-y-8">
          {gaps.length ? (
            <Notice variant="warning" title="Towns with tours but no guide">
              {gaps.map((a) => a.municipality).join(", ")}. Add a service area to a guide below so these tours get a guide.
            </Notice>
          ) : null}
          {unguided.length ? (
            <Notice variant="warning" title="Tours that can't get a guide yet">
              {unguided.map((p) => `${p.title} (${p.operator})`).join(", ")}. Choose guides for them below, or have the operator set their municipality.
            </Notice>
          ) : null}
          {coverage.unplacedPackages ? (
            <Notice variant="info">
              {coverage.unplacedPackages} published tour{coverage.unplacedPackages === 1 ? " has" : "s have"} no municipality yet, so no guide is proposed for {coverage.unplacedPackages === 1 ? "it" : "them"}. Operators set it on the package page.
            </Notice>
          ) : null}

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
                        {b.reference} · {b.operator} · {b.pax} guest{b.pax === 1 ? "" : "s"} · {b.municipality ?? "No municipality"} · {b.status}
                      </p>
                      <p className="mt-1 text-sm text-daet-ink">
                        {b.proposal === "proposed"
                          ? `Proposed: ${b.proposedGuideName ?? "a guide"} (${b.proposedBy === "admin" ? "by an admin" : "automatic"}), waiting for the operator.`
                          : b.proposal === "none_available"
                            ? "No free guide in this area that day."
                            : "No guide proposed yet."}
                      </p>
                    </div>
                    <ProposeGuide bookingId={b.id} guides={guideOptions} current={b.proposedGuideId} />
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
              These guides are proposed first for the package&apos;s bookings. When all of them are busy, a free guide from the package&apos;s municipality is proposed instead.
            </p>
            {coverage.packages.length === 0 ? (
              <p className="rounded-2xl bg-surface p-4 text-slate-600 dark:text-slate-400">No published packages yet.</p>
            ) : (
              <div className="space-y-3">
                {coverage.packages.map((p) => (
                  <PackageGuidesForm key={p.id} pkg={p} guides={guideOptions} />
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="areas-heading">
            <h2 id="areas-heading" className="mb-3 text-xl font-bold text-daet-ink">
              Guides per municipality
            </h2>
            <div className="overflow-x-auto rounded-2xl card-edge bg-surface p-4">
              <table className="w-full min-w-[24rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="py-2 pr-3">Municipality</th>
                    <th scope="col" className="py-2 pr-3 text-right">Guides</th>
                    <th scope="col" className="py-2 text-right">Published tours</th>
                  </tr>
                </thead>
                <tbody>
                  {coverage.areas.map((a) => (
                    <tr key={a.municipality} className="border-b border-line/60">
                      <td className="py-2 pr-3 font-bold">{a.municipality}</td>
                      <td className={`py-2 pr-3 text-right ${a.packages > 0 && a.guides === 0 ? "font-bold text-red-700 dark:text-red-300" : ""}`}>{a.guides}</td>
                      <td className="py-2 text-right">{a.packages}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="guides-heading">
            <h2 id="guides-heading" className="mb-3 text-xl font-bold text-daet-ink">
              Service areas by guide
            </h2>
            {coverage.guides.length === 0 ? (
              <p className="rounded-2xl bg-surface p-4 text-slate-600 dark:text-slate-400">No approved guides yet.</p>
            ) : (
              <div className="space-y-3">
                {coverage.guides.map((g) => (
                  <GuideAreasForm key={g.id} guideId={g.id} name={g.name} areas={g.areas} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </PageFrame>
  );
}
