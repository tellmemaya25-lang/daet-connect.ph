import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LineIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { Stars } from "@/components/tours/star-rating";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { parseReports, reasonLabel } from "@/lib/tours/admin-moderation";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";
import { ReportActions } from "./report-actions";

export const metadata = { title: "Reports" };

const STATUSES = [
  { key: "open", label: "Open" },
  { key: "actioned", label: "Acted on" },
  { key: "dismissed", label: "Dismissed" },
  { key: "all", label: "All" },
] as const;
const TYPE_LABEL = { review: "Review", profile: "Account", package: "Package" } as const;
const when = (iso: string) => (iso ? new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }) : "");

/** The reports queue: what people flagged, and what to do about it. Read once per visit. */
export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next="/tours/admin/reports" />;
  const params = await searchParams;
  const status = STATUSES.find((s) => s.key === params.status)?.key ?? "open";
  await admin.supabase.rpc("tours_admin_clear_expired_bans");
  const { data, error } = await admin.supabase.rpc("tours_admin_reports", { p_status: status, p_limit: 100 });
  const reports = parseReports(data);

  return (
    <PageFrame adminNav>
      <AdminPageHeading title="Reports" backHref="/tours/admin" backLabel="Admin dashboard" />
      <p className="mb-4 max-w-2xl text-sm text-daet-ink/65">
        Travellers, operators and guides report reviews, accounts and packages here. Hide a review or ban the account if needed, then close the report: the person who reported it is told. Every step is in the{" "}
        <Link href="/tours/admin/activity?entity=admin_action" className="font-bold text-blue-700 underline underline-offset-4 dark:text-blue-300">
          activity log
        </Link>
        .
      </p>
      <nav aria-label="Filter reports" className="mb-6 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Link
            key={s.key}
            href={s.key === "open" ? "/tours/admin/reports" : `/tours/admin/reports?status=${s.key}`}
            aria-current={status === s.key ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold ${status === s.key ? "bg-daet-forest text-white" : "border border-daet-ink/15 bg-surface text-daet-ink hover:bg-daet-sand"}`}
          >
            {s.label}
          </Link>
        ))}
      </nav>
      {error ? <Notice variant="error" className="mb-4">Reports could not be loaded.</Notice> : null}
      {reports.length === 0 ? (
        <EmptyState icon={<LineIcon name="check" />} title={status === "open" ? "No open reports" : "No reports here"} />
      ) : (
        <ul className="space-y-4">
          {reports.map((r) => (
            <li key={r.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-daet-ink">
                      {TYPE_LABEL[r.type]}: {r.type === "package" ? (r.pkg?.title ?? "Package") : r.targetName}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {reasonLabel(r.reason)} · reported by {r.reporter} · {when(r.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.openOnTarget > 1 ? <Badge tone="warning">{r.openOnTarget} open reports</Badge> : null}
                    {r.targetSuspended ? <Badge tone="danger">Banned</Badge> : null}
                    {r.status !== "open" ? <Badge tone="neutral">{r.status === "actioned" ? "Acted on" : "Dismissed"}</Badge> : null}
                  </div>
                </div>
                {r.details ? <p className="mt-2 whitespace-pre-line text-sm text-daet-ink/80">“{r.details}”</p> : null}
                {r.review ? (
                  <div className="mt-3 rounded-2xl bg-canvas p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Stars value={r.review.rating} />
                      <span className="text-daet-ink/70">about {r.review.about}</span>
                      {r.review.hidden ? <Badge tone="danger">Hidden</Badge> : null}
                    </div>
                    {r.review.comment ? <p className="mt-1 text-daet-ink/80">{r.review.comment}</p> : null}
                  </div>
                ) : null}
                {r.type === "package" ? (
                  <Link href={`/tours/packages/${r.targetId}`} className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-blue-700 underline underline-offset-4 dark:text-blue-300">
                    Open the package
                  </Link>
                ) : null}
                {r.note ? <p className="mt-2 text-xs font-bold text-daet-ink/70">Note: {r.note}</p> : null}
                {r.status === "open" ? (
                  <ReportActions
                    reportId={r.id}
                    reviewId={r.type === "review" ? r.targetId : null}
                    reviewHidden={r.review?.hidden ?? false}
                    profileId={r.targetProfileId}
                    profileName={r.targetName}
                    canBan={r.targetRole !== "admin" && !r.targetSuspended}
                  />
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageFrame>
  );
}
