import Link from "next/link";
import { Notice } from "@/components/ui/notice";
import { AdminPage } from "@/components/admin/admin-page";
import { Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { AdminPageHeading, PromoAdminDenied } from "@/components/tours/promo-admin-denied";
import { ACTIVITY_ENTITIES, ACTIVITY_ROLES, describeActivity, entityLabel, isActivityEntity, isActivityRole, parseActivity } from "@/lib/tours/admin-moderation";
import { isDateKey } from "@/lib/tours/events-calendar";
import { isUuid } from "@/lib/tours/operator-access";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";

export const metadata = { title: "Activity log" };

const PAGE = 50;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Manila" });
const ROLE_LABEL: Record<string, string> = { admin: "Admin", operator: "Operator", guide: "Guide", tourist: "Traveller", system: "System" };

/**
 * The audit log: every create, change and delete on the tables the dashboards
 * write, plus admin actions, newest first, 50 at a time. Filters are a plain
 * GET form; "Older" moves the window. Nothing refreshes on its own.
 */
export default async function AdminActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return <PromoAdminDenied message={admin.error} next="/tours/admin/activity" />;
  const params = await searchParams;
  const entity = isActivityEntity(one(params.entity)) ? one(params.entity) : "";
  const role = isActivityRole(one(params.role)) ? one(params.role) : "";
  const actor = isUuid(one(params.actor)) ? one(params.actor) : "";
  const from = isDateKey(one(params.from)) ? one(params.from) : "";
  const to = isDateKey(one(params.to)) ? one(params.to) : "";
  const beforeRaw = one(params.before);
  const before = beforeRaw && !Number.isNaN(Date.parse(beforeRaw)) ? new Date(beforeRaw).toISOString() : "";

  const { data, error } = await admin.supabase.rpc("tours_admin_activity", {
    p_entity: entity || undefined,
    p_role: role || undefined,
    p_actor: actor || undefined,
    p_from: from || undefined,
    p_to: to || undefined,
    p_before: before || undefined,
    p_limit: PAGE,
  });
  const rows = parseActivity(data);
  const keep = { ...(entity ? { entity } : {}), ...(role ? { role } : {}), ...(actor ? { actor } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) };
  const older = rows.length === PAGE ? `/tours/admin/activity?${new URLSearchParams({ ...keep, before: rows[rows.length - 1].at })}` : null;

  return (
    <AdminPage>
      <AdminPageHeading title="Activity log" backHref="/tours/admin" backLabel="Admin dashboard" />
      <p className="mb-4 max-w-3xl text-sm text-daet-ink/65">
        Every booking, payment, package, review, account, guide and trip-plan change made from any dashboard, with who made it. Admin actions such as approvals and bans are included. Bank and GCash numbers are never recorded.
      </p>

      <form action="/tours/admin/activity" className="mb-6 grid gap-3 rounded-2xl card-edge bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <Field id="log-entity" label="What">
          <Select name="entity" defaultValue={entity}>
            <option value="">Everything</option>
            {ACTIVITY_ENTITIES.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="log-role" label="Who">
          <Select name="role" defaultValue={role}>
            <option value="">Anyone</option>
            {ACTIVITY_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
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
          {actor ? <Input type="hidden" name="actor" value={actor} /> : null}
          <Button type="submit">Show</Button>
          <Link href="/tours/admin/activity" className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold text-daet-ink hover:bg-muted">
            Clear
          </Link>
        </div>
      </form>

      {actor ? (
        <p className="mb-3 text-sm text-daet-ink/70">
          Showing one person&apos;s activity.{" "}
          <Link href={`/tours/admin/activity?${new URLSearchParams(Object.fromEntries(Object.entries(keep).filter(([k]) => k !== "actor")))}`} className="font-bold text-blue-700 underline underline-offset-4 dark:text-blue-300">
            Show everyone
          </Link>
        </p>
      ) : null}

      {error ? (
        <Notice variant="error" title="The activity log could not be loaded">
          {error.code === "PGRST202" ? "The database update for the activity log has not been applied yet." : "Please try again in a moment."}
        </Notice>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl bg-surface p-4 text-daet-ink/70">Nothing recorded for these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl card-edge bg-surface" tabIndex={0} role="group" aria-label="Activity table">
          <table className="w-full min-w-[44rem] text-left text-sm">
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
                    {r.actorId ? (
                      <Link href={`/tours/admin/activity?${new URLSearchParams({ actor: r.actorId })}`} className="inline-block min-h-6 py-1 font-bold text-daet-ink hover:underline">
                        {r.actorName ?? "Unknown"}
                      </Link>
                    ) : (
                      <span className="font-bold text-daet-ink">System</span>
                    )}
                    <span className="block text-xs text-daet-ink/70">{ROLE_LABEL[r.actorRole] ?? r.actorRole}</span>
                  </td>
                  <td className="px-4 py-2">{entityLabel(r.entity)}</td>
                  <td className="px-4 py-2 break-words">
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
    </AdminPage>
  );
}
