import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  APPLICATION_COLUMNS,
  guideStatusText,
  interviewTimeText,
  OPEN_STATUSES,
  parseApplications,
  REAPPLY_STATUSES,
  type GuideApplication,
} from "@/lib/tours/guide-applications";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { ApplyForm, GuideApplicationActions } from "./guide-applications-ui";

export const metadata = { title: "Operators" };

type Operator = { id: string; business_name: string; business_description: string | null; business_address: string | null };

/**
 * A guide's operators: the ones they work with (and their share), applications
 * in progress, and operators they can apply to.
 */
export default async function GuideOperatorsPage() {
  const session = await getAuthenticatedSession();
  if (!session.user) redirect(`/login?next=${encodeURIComponent("/tours/guide/operators")}`);
  if (session.role !== "guide") redirect("/dashboard");

  const supabase = await createSupabaseServerClient();
  const { data: guide } = await supabase.from("tours_guides").select("id, accreditation_status").eq("profile_id", session.user.id).maybeSingle();
  if (!guide) redirect("/tours/guide/register");

  const [{ data: appRows, error: appError }, { data: operatorRows }] = await Promise.all([
    supabase.from("tours_guide_applications").select(APPLICATION_COLUMNS).eq("guide_id", guide.id).order("updated_at", { ascending: false }),
    supabase.from("tours_operators").select("id, business_name, business_description, business_address").eq("accreditation_status", "approved").order("business_name"),
  ]);
  const apps = parseApplications(appRows);
  const operators = (operatorRows ?? []) as Operator[];
  const name = new Map(operators.map((o) => [o.id, o.business_name]));
  const byOperator = new Map(apps.map((a) => [a.operatorId, a]));
  const working = apps.filter((a) => a.status === "active");
  const open = apps.filter((a) => OPEN_STATUSES.has(a.status));
  const canApply = operators.filter((o) => !byOperator.has(o.id) || REAPPLY_STATUSES.has(byOperator.get(o.id)!.status));
  const approved = guide.accreditation_status === "approved";

  return (
    <PageFrame>
      <Link href="/tours/guide/dashboard" className="inline-flex min-h-11 items-center text-sm font-bold text-daet-forest hover:underline dark:text-blue-300">
        ← Dashboard
      </Link>
      <h1 className="display-2 mb-2 text-daet-ink">Operators</h1>
      <p className="mb-6 max-w-3xl text-slate-600 dark:text-slate-400">
        Apply to guide for an operator. They interview you, then offer you a share of each tour&apos;s price. Once you accept, they can assign you to their tours. You can work with more than one operator.
      </p>

      {!approved ? (
        <Notice variant="warning" title="Wait for your accreditation">
          You can apply to operators once the Tourism Office approves you as a guide.
        </Notice>
      ) : null}
      {appError ? (
        <Notice variant="error" title="Your applications could not be loaded">
          Please try again in a moment.
        </Notice>
      ) : null}

      <div className="space-y-8">
        <Section title="You guide for" empty="No operators yet. Apply to one below." items={working} render={(a) => <AppCard key={a.id} app={a} operatorName={name.get(a.operatorId) ?? "Operator"} />} />
        {open.length ? <Section title="Applications in progress" items={open} render={(a) => <AppCard key={a.id} app={a} operatorName={name.get(a.operatorId) ?? "Operator"} />} /> : null}

        {approved ? (
          <section aria-labelledby="apply-heading" className="space-y-3">
            <h2 id="apply-heading" className="text-xl font-bold text-daet-ink">
              Apply to an operator
            </h2>
            {canApply.length === 0 ? (
              <p className="text-slate-600 dark:text-slate-400">You have applied to every operator.</p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {canApply.map((o) => (
                  <li key={o.id}>
                    <Card className="h-full space-y-2">
                      <p className="font-bold text-daet-ink">{o.business_name}</p>
                      {o.business_address ? <p className="text-sm text-slate-600 dark:text-slate-400">{o.business_address}</p> : null}
                      {o.business_description ? <p className="line-clamp-3 text-sm text-daet-ink">{o.business_description}</p> : null}
                      {byOperator.has(o.id) ? <p className="text-sm text-slate-600 dark:text-slate-400">{guideStatusText(byOperator.get(o.id)!)} You can apply again.</p> : null}
                      <ApplyForm operatorId={o.id} operatorName={o.business_name} />
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </PageFrame>
  );
}

function Section({ title, empty, items, render }: { title: string; empty?: string; items: GuideApplication[]; render: (a: GuideApplication) => React.ReactNode }) {
  const id = title.toLowerCase().replace(/\W+/g, "-");
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-xl font-bold text-daet-ink">
        {title}
      </h2>
      {items.length ? <ul className="space-y-3">{items.map((a) => <li key={a.id}>{render(a)}</li>)}</ul> : <p className="text-slate-600 dark:text-slate-400">{empty}</p>}
    </section>
  );
}

function AppCard({ app, operatorName }: { app: GuideApplication; operatorName: string }) {
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-lg font-bold text-daet-ink">{operatorName}</p>
        {app.status === "active" ? <Badge tone="success">{app.sharePct ? `${Number(app.sharePct.toFixed(2))}% share` : "Fixed fee"}</Badge> : <Badge tone="info">In progress</Badge>}
      </div>
      <p className="text-daet-ink">{guideStatusText(app)}</p>
      {app.status === "interview_scheduled" && app.interviewAt ? (
        <dl className="grid gap-1 rounded-xl bg-canvas p-3 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="font-bold text-daet-ink">Interview</dt>
          <dd>{interviewTimeText(app.interviewAt)} (Manila time)</dd>
          {app.interviewPlace ? (
            <>
              <dt className="font-bold text-daet-ink">Place</dt>
              <dd>{app.interviewPlace}</dd>
            </>
          ) : null}
          {app.interviewLink ? (
            <>
              <dt className="font-bold text-daet-ink">Online</dt>
              <dd>
                <a href={app.interviewLink} target="_blank" rel="noopener noreferrer" className="font-bold text-blue-700 underline dark:text-blue-300">
                  Join the meeting
                </a>
              </dd>
            </>
          ) : null}
        </dl>
      ) : null}
      <GuideApplicationActions app={app} operatorName={operatorName} />
    </Card>
  );
}
