import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  APPLICATION_COLUMNS,
  interviewTimeText,
  OPEN_STATUSES,
  operatorStatusText,
  parseApplications,
  pctText,
  type GuideApplication,
} from "@/lib/tours/guide-applications";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { RangePicker } from "@/components/tours/earnings-view";
import { formatPeso } from "@/lib/money";
import { parseAnalyticsRange } from "@/lib/tours/dashboards";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { averageRecentTours, parseGuideStats, topGuides, underAssigned, type GuideStats } from "@/lib/tours/guide-management";
import { AutoAssignSwitch, PackageGuidesPanel } from "./guide-management-ui";
import { OperatorApplicationActions } from "./operator-applications-ui";

export const metadata = { title: "Guides" };

type GuideInfo = { name: string; years: number | null; specialties: string[]; phone: string | null };

/**
 * The operator's guides: applications to interview and make offers on, the
 * team (only they can be assigned to this operator's tours), and past ones.
 */
export default async function OperatorGuidesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getAuthenticatedSession();
  if (!session.user) redirect(`/login?next=${encodeURIComponent("/tours/operator/guides")}`);
  if (session.role !== "operator") redirect("/dashboard");

  const supabase = await createSupabaseServerClient();
  const { data: operator } = await supabase.from("tours_operators").select("id, accreditation_status").eq("profile_id", session.user.id).maybeSingle();
  if (!operator) redirect("/tours/operator/register");

  const today = toManilaDateKey(new Date());
  const range = parseAnalyticsRange(await searchParams, today);
  const [{ data: appRows, error }, statsResult] = await Promise.all([
    supabase.from("tours_guide_applications").select(APPLICATION_COLUMNS).eq("operator_id", operator.id).order("updated_at", { ascending: false }),
    operator.accreditation_status === "approved" ? supabase.rpc("tours_operator_guide_stats", { p_from: range.from, p_to: range.to }) : Promise.resolve({ data: null, error: null }),
  ]);
  const stats = statsResult.data ? parseGuideStats(statsResult.data) : null;
  const apps = parseApplications(appRows);
  const guides = await loadGuides(supabase, [...new Set(apps.map((a) => a.guideId))]);
  const info = (a: GuideApplication) => guides.get(a.guideId) ?? { name: "Guide", years: null, specialties: [], phone: null };

  const open = apps.filter((a) => OPEN_STATUSES.has(a.status));
  const team = apps.filter((a) => a.status === "active");
  const past = apps.filter((a) => !OPEN_STATUSES.has(a.status) && a.status !== "active");

  return (
    <PageFrame>
      <Link href="/tours/operator/dashboard" className="inline-flex min-h-11 items-center text-sm font-bold text-daet-forest hover:underline dark:text-blue-300">
        ← Dashboard
      </Link>
      <h1 className="display-2 mb-2 text-daet-ink">Guides</h1>
      <p className="mb-6 max-w-3xl text-slate-600 dark:text-slate-400">
        Accredited guides apply to work with you. Interview them, then offer a share of each tour&apos;s price. Once a guide accepts, they join your team, and only your team can be assigned to your tours.
      </p>
      {operator.accreditation_status !== "approved" ? (
        <Notice variant="warning" title="Waiting for your accreditation">
          Guides can apply once the Tourism Office approves your business.
        </Notice>
      ) : null}
      {error ? (
        <Notice variant="error" title="Applications could not be loaded">
          Please try again in a moment.
        </Notice>
      ) : null}

      <div className="space-y-8">
        {stats ? <TeamOverview stats={stats} range={range} today={today} /> : statsResult.error ? (
          <Notice variant="error" title="Team figures could not be loaded">
            Please try again in a moment.
          </Notice>
        ) : null}

        <section aria-labelledby="applications-heading" className="space-y-3">
          <h2 id="applications-heading" className="text-xl font-bold text-daet-ink">
            Applications {open.length ? <span className="text-base font-normal text-slate-600 dark:text-slate-400">({open.length})</span> : null}
          </h2>
          {open.length === 0 ? (
            <p className="text-slate-600 dark:text-slate-400">No applications right now. Accredited guides find you under Operators in their account.</p>
          ) : (
            <ul className="space-y-3">
              {open.map((a) => (
                <li key={a.id}>
                  <GuideCard app={a} guide={info(a)} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="team-heading" className="space-y-3">
          <h2 id="team-heading" className="text-xl font-bold text-daet-ink">
            Your team {team.length ? <span className="text-base font-normal text-slate-600 dark:text-slate-400">({team.length})</span> : null}
          </h2>
          {team.length === 0 ? (
            <p className="text-slate-600 dark:text-slate-400">No guides on your team yet, so none can be assigned to your tours.</p>
          ) : (
            <ul className="space-y-3">
              {team.map((a) => (
                <li key={a.id}>
                  <GuideCard app={a} guide={info(a)} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {past.length ? (
          <details className="rounded-2xl bg-surface p-4">
            <summary className="flex min-h-11 cursor-pointer items-center font-bold text-daet-ink">Past applications ({past.length})</summary>
            <ul className="mt-2 space-y-2">
              {past.map((a) => (
                <li key={a.id} className="text-sm">
                  <span className="font-bold text-daet-ink">{info(a).name}</span> · {operatorStatusText(a)}
                  {a.decidedNote ? ` "${a.decidedNote}"` : ""}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </PageFrame>
  );
}

async function loadGuides(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, ids: string[]): Promise<Map<string, GuideInfo>> {
  if (!ids.length) return new Map();
  const { data: rows } = await supabase.from("tours_guides").select("id, profile_id, years_experience, specialties, contact_phone").in("id", ids);
  const profileIds = (rows ?? []).map((r) => r.profile_id).filter(Boolean);
  const { data: profiles } = profileIds.length ? await supabase.from("profiles").select("id, full_name").in("id", profileIds) : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name?.trim() || "Guide"]));
  return new Map(
    (rows ?? []).map((r) => [
      r.id,
      { name: names.get(r.profile_id) ?? "Guide", years: r.years_experience ?? null, specialties: r.specialties ?? [], phone: r.contact_phone ?? null },
    ]),
  );
}

function GuideCard({ app, guide }: { app: GuideApplication; guide: GuideInfo }) {
  const details = [guide.years !== null ? `${guide.years} year${guide.years === 1 ? "" : "s"} guiding` : null, guide.specialties.slice(0, 3).join(", ") || null].filter(Boolean);
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-lg font-bold text-daet-ink">{guide.name}</p>
          {details.length ? <p className="text-sm text-slate-600 dark:text-slate-400">{details.join(" · ")}</p> : null}
        </div>
        {app.status === "active" ? (
          <Badge tone="success">{app.sharePct ? `${pctText(app.sharePct)} share` : "Fixed fee"}</Badge>
        ) : (
          <Badge tone={app.status === "applied" ? "brand" : "info"}>{app.status === "applied" ? "New" : "In progress"}</Badge>
        )}
      </div>
      <p className="text-daet-ink">{operatorStatusText(app)}</p>
      {app.message && app.status !== "active" ? <blockquote className="border-l-4 border-blue-300 pl-3 text-sm text-daet-ink">{app.message}</blockquote> : null}
      {app.status === "active" && app.offeredPct ? <p className="text-sm text-slate-600 dark:text-slate-400">You offered {pctText(app.offeredPct)}; waiting for the guide to accept.</p> : null}
      {app.status === "interview_scheduled" && app.interviewAt ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Interview {interviewTimeText(app.interviewAt)}
          {app.interviewPlace ? ` · ${app.interviewPlace}` : ""}
          {app.interviewLink ? " · online" : ""}
        </p>
      ) : null}
      {guide.phone ? (
        <a href={`tel:${guide.phone.replace(/[^\d+]/g, "")}`} className="inline-flex min-h-11 items-center text-sm font-bold text-blue-700 hover:underline dark:text-blue-300">
          Call {guide.name.split(/\s+/)[0]}
        </a>
      ) : null}
      <OperatorApplicationActions app={app} guideName={guide.name.split(/\s+/)[0]} />
    </Card>
  );
}

/** Assignment settings, each guide's figures, who leads and who needs more tours, and guides per package. */
function TeamOverview({ stats, range, today }: { stats: GuideStats; range: Parameters<typeof RangePicker>[0]["range"]; today: string }) {
  const top = topGuides(stats.guides);
  const under = underAssigned(stats.guides);
  const average = averageRecentTours(stats.guides);
  return (
    <>
      <section aria-labelledby="assign-heading" className="space-y-3">
        <h2 id="assign-heading" className="text-xl font-bold text-daet-ink">
          Assigning guides
        </h2>
        <Card className="space-y-3">
          <AutoAssignSwitch initial={stats.autoAssign} />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            On: each new booking gets a guide straight away. Off: the guide is proposed and you approve it on Bookings. Either way, the pick takes, in order: a guide ranked for the tour (then one who serves its area), the one with the fewest of your tours in the last 30 days, your ranking, then the higher rating. Only free guides on your team are picked.
          </p>
        </Card>
      </section>

      <section aria-labelledby="overview-heading" className="space-y-3">
        <h2 id="overview-heading" className="text-xl font-bold text-daet-ink">
          Your guides
        </h2>
        <RangePicker path="/tours/operator/guides" range={range} today={today} />
        {stats.guides.length === 0 ? (
          <p className="text-slate-600 dark:text-slate-400">No guides on your team yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl card-edge bg-surface p-4" role="region" aria-label="Guide figures (scrolls sideways)" tabIndex={0}>
            <table className="w-full min-w-[44rem] text-left text-sm">
              <caption className="sr-only">Each guide on your team: availability, load, pay and revenue</caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pr-3">Guide</th>
                  <th scope="col" className="py-2 pr-3">Pay</th>
                  <th scope="col" className="py-2 pr-3 text-right">Free days (next 30)</th>
                  <th scope="col" className="py-2 pr-3 text-right">Upcoming</th>
                  <th scope="col" className="py-2 pr-3 text-right">Tours (last 30 days)</th>
                  <th scope="col" className="py-2 pr-3 text-right">Completed</th>
                  <th scope="col" className="py-2 pr-3 text-right">Earned</th>
                  <th scope="col" className="py-2 pr-3 text-right">Revenue</th>
                  <th scope="col" className="py-2 text-right">Rating</th>
                </tr>
              </thead>
              <tbody>
                {stats.guides.map((g) => (
                  <tr key={g.id} className="border-b border-line/60">
                    <th scope="row" className="py-2 pr-3 font-bold text-daet-ink">
                      <Link href={`/tours/operator/guides/${g.id}`} className="text-blue-700 underline underline-offset-4 dark:text-blue-300">
                        {g.name}
                      </Link>
                    </th>
                    <td className="py-2 pr-3">{g.sharePct ? `${pctText(g.sharePct)} share` : "Fixed fee"}</td>
                    <td className="py-2 pr-3 text-right">{g.freeDays}</td>
                    <td className="py-2 pr-3 text-right">{g.upcoming}</td>
                    <td className="py-2 pr-3 text-right">{g.recentTours}</td>
                    <td className="py-2 pr-3 text-right">{g.completed}</td>
                    <td className="py-2 pr-3 text-right">{formatPeso(g.earned)}</td>
                    <td className="py-2 pr-3 text-right">{formatPeso(g.revenue)}</td>
                    <td className="py-2 text-right">{g.rating !== null ? `${g.rating.toFixed(1)}★ (${g.reviews})` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Completed, earned and revenue cover the dates above. Earned is what you owe the guide; revenue is the booking totals of the tours they led.</p>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <Card className="space-y-2">
            <h3 className="font-bold text-daet-ink">Top guides</h3>
            {top.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">No completed tours in these dates yet.</p>
            ) : (
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {top.map((g) => (
                  <li key={g.id}>
                    <span className="font-bold text-daet-ink">{g.name}</span>: {g.completed} tour{g.completed === 1 ? "" : "s"}, {formatPeso(g.revenue)}
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Card className="space-y-2">
            <h3 className="font-bold text-daet-ink">Not getting enough tours</h3>
            {under.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">Work is spread evenly{average ? ` (about ${average} tours each in 30 days)` : ""}.</p>
            ) : (
              <>
                <ul className="space-y-1 text-sm">
                  {under.map((g) => (
                    <li key={g.id}>
                      <span className="font-bold text-daet-ink">{g.name}</span>: {g.recentTours} tour{g.recentTours === 1 ? "" : "s"} in 30 days, {g.freeDays} free day{g.freeDays === 1 ? "" : "s"} ahead
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-slate-600 dark:text-slate-400">The team averages {average} tours each. Automatic assignment gives the next tours to guides with fewer, so add them to more of your tours below.</p>
              </>
            )}
          </Card>
        </div>
      </section>

      <section aria-labelledby="by-tour-heading" className="space-y-3">
        <h2 id="by-tour-heading" className="text-xl font-bold text-daet-ink">
          Guides by tour
        </h2>
        <Card>
          <PackageGuidesPanel stats={stats} />
        </Card>
      </section>
    </>
  );
}
