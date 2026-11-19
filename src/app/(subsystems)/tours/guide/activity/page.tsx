import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { describeActivity, entityLabel, GUIDE_ACTIVITY_ENTITIES, parseActivity } from "@/lib/tours/admin-moderation";
import { isDateKey } from "@/lib/tours/events-calendar";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";

export const metadata = { title: "Activity log" };

const BASE = "/tours/guide/activity";
const PAGE = 50;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Manila" });
const ROLE_LABEL: Record<string, string> = { admin: "Admin", operator: "Operator", guide: "You", tourist: "Traveller", system: "System" };

/**
 * The guide's audit log: changes to the tours assigned to them, their operator applications,
 * swap requests and schedule, made by the guide, newest first, 50 at a time. The database
 * function limits it to the guide's own records.
 */
export default async function GuideActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getAuthenticatedSession();
  if (!session.user) redirect(`/login?next=${encodeURIComponent(BASE)}`);
  if (session.role !== "guide") redirect("/dashboard");

  const params = await searchParams;
  const entityRaw = one(params.entity);
  const entity = GUIDE_ACTIVITY_ENTITIES.some((e) => e.value === entityRaw) ? entityRaw : "";
  const from = isDateKey(one(params.from)) ? one(params.from) : "";
  const to = isDateKey(one(params.to)) ? one(params.to) : "";
  const beforeRaw = one(params.before);
  const before = beforeRaw && !Number.isNaN(Date.parse(beforeRaw)) ? new Date(beforeRaw).toISOString() : "";

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("tours_guide_activity", {
    p_entity: entity || undefined,
    p_from: from || undefined,
    p_to: to || undefined,
    p_before: before || undefined,
    p_limit: PAGE,
  });
  const rows = parseActivity(data);
  const keep = { ...(entity ? { entity } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) };
  const older = rows.length === PAGE ? `${BASE}?${new URLSearchParams({ ...keep, before: rows[rows.length - 1].at })}` : null;

  return (
    <PageFrame>
      <Link href="/tours/guide/dashboard" className="inline-flex min-h-11 items-center text-sm font-bold text-daet-forest hover:underline dark:text-blue-300">
        ← Dashboard
      </Link>
      <h1 className="display-2 mb-2 text-daet-ink">Activity log</h1>
      <p className="mb-4 max-w-3xl text-sm text-daet-ink/65">
        Changes you made to your assigned tours, operator applications, swap requests and schedule. Other people's actions are not shown here.
      </p>

      <form action={BASE} className="mb-6 grid gap-3 rounded-2xl card-edge bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <Field id="log-entity" label="What">
          <Select name="entity" defaultValue={entity}>
            <option value="">Everything</option>
            {GUIDE_ACTIVITY_ENTITIES.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="log-from" label="From">
          <Input type="date" name="from" defaultValue={from} />
        </Field>
        <Field id="log-to" label="To">
          <Input type="date" name="to" defaultValue={to} />
        </Field>
        <div className="flex gap-2">
          <Button type="submit">Show</Button>
          <Link href={BASE} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold text-daet-ink hover:bg-muted">
            Clear
          </Link>
        </div>
      </form>

      {error ? (
        <Notice variant="error" title="The activity log could not be loaded">
          {error.code === "PGRST202" ? "The database update for the guide activity log has not been applied yet." : "Please try again in a moment."}
        </Notice>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl bg-surface p-4 text-daet-ink/70">Nothing recorded for these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl card-edge bg-surface" tabIndex={0} role="group" aria-label="Activity table">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Activity, newest first</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="px-4 py-2">When</th>
                <th scope="col" className="px-4 py-2">Who</th>
                <th scope="col" className="px-4 py-2">Area</th>
                <th scope="col" className="px-4 py-2">What happened</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line/60 align-top">
                  <td className="whitespace-nowrap px-4 py-2 text-daet-ink/80">{when(r.at)}</td>
                  <td className="px-4 py-2">
                    <span className="font-bold text-daet-ink">{r.actorId ? (r.actorRole === "tourist" ? "Traveller" : (r.actorName ?? "Unknown")) : "System"}</span>
                    <span className="block text-xs text-daet-ink/70">{ROLE_LABEL[r.actorRole] ?? r.actorRole}</span>
                  </td>
                  <td className="px-4 py-2">{entityLabel(r.entity)}</td>
                  <td className="px-4 py-2 [overflow-wrap:anywhere]">
                    {describeActivity(r)}
                    {r.entityId ? <span className="block text-xs text-daet-ink/70">{r.entityId}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {older ? (
        <Link href={older} className="mt-4 inline-flex min-h-11 items-center rounded-full border border-daet-forest/30 bg-surface px-5 text-sm font-bold text-daet-leaf hover:bg-daet-forest/5 dark:text-blue-300">
          Older entries
        </Link>
      ) : null}
    </PageFrame>
  );
}
