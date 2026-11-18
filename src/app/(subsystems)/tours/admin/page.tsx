import { LiveCount } from "@/components/live/live-count";
import { LineIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { AdminPage } from "@/components/admin/admin-page";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/tours/server-auth";
import { searchTerm } from "@/components/ui/search-term";
import { ADMIN_SEARCH_STATUSES, ADMIN_SEARCH_TYPES, parseAdminSearchStatus, parseAdminSearchType } from "@/lib/tours/admin-search";
import { searchAdminRecords, type AdminSearchResult } from "@/lib/tours/admin-search.server";
import { GUIDE_TABLE, GUIDE_USER_ID_COLUMN } from "@/lib/tours/guide-contract";
import Link from "next/link";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createSupabaseServerClient();
  
  // Check if user is admin
  const user = await getAuthUser();
  if (!user) {
    return (
      <AdminPage>
        <div className="mx-auto max-w-2xl py-8">
          <Notice variant="info" title="Admin sign-in required">
            <Link href={`/login?next=${encodeURIComponent("/tours/admin")}`} className="font-bold underline underline-offset-4">
              Sign in
            </Link>{" "}
            with a Tourism Office admin account.
          </Notice>
        </div>
      </AdminPage>
    );
  }
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();
  
  if (profile?.role !== 'admin') {
    return (
      <AdminPage>
        <div className="mx-auto max-w-2xl py-8">
          <Notice variant="error" title="Access denied">
            Only Tourism Office admins can access this dashboard.
          </Notice>
        </div>
      </AdminPage>
    );
  }

  const params = await searchParams;
  const query = searchTerm(params.q);
  const searchType = parseAdminSearchType(params.type);
  const searchStatus = parseAdminSearchStatus(params.status);
  const searchResult = query.length >= 2
    ? await searchAdminRecords({
        supabase,
        applicationSupabase: isSupabaseAdminConfigured() ? createSupabaseAdminClient() : supabase,
        term: query,
        type: searchType,
        status: searchStatus,
      })
    : null;
  const searchGroups = searchResult?.results.reduce<Array<{ kind: string; items: AdminSearchResult[] }>>((groups, result) => {
    let group = groups.find((item) => item.kind === result.kind);
    if (!group) {
      group = { kind: result.kind, items: [] };
      groups.push(group);
    }
    group.items.push(result);
    return groups;
  }, []) ?? [];

  // Get counts of pending items
  const [
    operatorsResult,
    guidesResult,
    pendingPackagesResult,
    publishedPackagesResult,
    bookingsResult,
  ] = await Promise.all([
    supabase.from('tours_operators').select('*', { count: 'exact', head: true }).eq('accreditation_status', 'pending'),
    supabase.from('tours_guides').select('*', { count: 'exact', head: true }).eq('accreditation_status', 'pending'),
    supabase.from('tours_packages').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
    supabase.from('tours_packages').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('tours_bookings').select('*', { count: 'exact', head: true }),
  ]);

  const pendingOperators = operatorsResult.count || 0;
  const pendingGuides = guidesResult.count || 0;
  const pendingPackages = pendingPackagesResult.count || 0;
  const publishedPackages = publishedPackagesResult.count || 0;
  const totalBookings = bookingsResult.count || 0;

  // Get recent admin activities
  const { data: recentActivities } = await supabase
    .from('tours_admin_audit_log')
    .select('*, profiles!inner(full_name)')
    .order('created_at', { ascending: false })
    .limit(5);

  // Oldest first, across the three queues: what the office should decide next.
  const [nextOperators, nextGuides, nextPackages] = await Promise.all([
    supabase.from("tours_operators").select("id, business_name, created_at").eq("accreditation_status", "pending").order("created_at").limit(5),
    supabase.from(GUIDE_TABLE).select(`id, ${GUIDE_USER_ID_COLUMN}, created_at`).eq("accreditation_status", "pending").order("created_at").limit(5),
    supabase.from("tours_packages").select("id, title, created_at").eq("status", "pending_review").order("created_at").limit(5),
  ]);
  const guideRows = (nextGuides.data ?? []) as unknown as Array<Record<string, string>>;
  const guideIds = guideRows.map((g) => g[GUIDE_USER_ID_COLUMN]).filter(Boolean);
  const { data: guideProfiles } = guideIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", guideIds)
    : { data: [] as Array<{ id: string; full_name: string | null }> };
  const guideNames = new Map((guideProfiles ?? []).map((p) => [p.id, p.full_name]));
  const waited = (createdAt: string) => Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000));
  const nextUp = [
    ...(nextOperators.data ?? []).map((o) => ({ id: o.id, kind: "Operator application", name: o.business_name || "Unnamed operator", href: "/tours/admin/operators", at: o.created_at })),
    ...guideRows.map((g) => ({ id: g.id, kind: "Guide application", name: guideNames.get(g[GUIDE_USER_ID_COLUMN]) || "Unnamed guide", href: "/tours/admin/guides", at: g.created_at })),
    ...(nextPackages.data ?? []).map((p) => ({ id: p.id, kind: "Package", name: p.title || "Untitled package", href: "/tours/admin/packages", at: p.created_at })),
  ]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(0, 6)
    .map((item) => ({ ...item, days: waited(item.at) }));
  const waiting = pendingOperators + pendingGuides + pendingPackages;

  return (
    <AdminPage>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-daet-ink/70">
        <ol className="flex items-center gap-2">
          <li>Admin</li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-bold text-daet-ink">Dashboard</li>
        </ol>
      </nav>
      <section aria-labelledby="dash-title" className="mb-8 border-b border-daet-ink/15 pb-6">
        <h1 id="dash-title" className="display-2 text-daet-ink">Dashboard</h1>
        <p className="mt-2 text-lg text-daet-ink">
          {waiting === 0 ? "Nothing is waiting on the office." : `${waiting} ${waiting === 1 ? "item is" : "items are"} waiting on the office.`}
          {" "}Welcome back, {profile.full_name || "Admin"}.
        </p>
      </section>


      {query ? (
        <section id="admin-search" aria-labelledby="admin-search-title" className="mb-8 rounded-2xl card-edge bg-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="admin-search-title" className="text-xl font-bold text-daet-ink">Results for “{query}”</h2>
              <p className="mt-1 text-sm leading-6 text-daet-ink/70">
                {ADMIN_SEARCH_TYPES.find((item) => item.value === searchType)?.label}
                {" · "}
                {ADMIN_SEARCH_STATUSES.find((item) => item.value === searchStatus)?.label}
                . Change the type or status in the search at the top.
              </p>
            </div>
            <Link href="/tours/admin" className="inline-flex min-h-11 items-center text-sm font-bold text-blue-700 underline underline-offset-4 dark:text-blue-300">Clear search</Link>
          </div>
          <p className="mt-3 text-xs leading-5 text-daet-ink/65">Up to 12 matches per record type are shown. Application results show pending operator and guide reviews only; private files remain behind their short-lived review links.</p>
        {query.length === 1 ? <p className="mt-3 text-sm font-semibold text-amber-800 dark:text-amber-200">Enter at least 2 characters to search.</p> : null}
        {searchResult?.hasError ? <Notice variant="warning" className="mt-4">Some record types could not be searched. The results below may be incomplete.</Notice> : null}
        {searchResult && searchResult.results.length === 0 ? <p className="mt-5 rounded-xl bg-canvas p-4 text-sm text-daet-ink/70">No records match “{query}” with those filters. Try a different search or status.</p> : null}
        {searchGroups.length > 0 ? (
          <div className="mt-5 space-y-5">
            {searchGroups.map((group) => (
              <section key={group.kind} aria-label={group.items[0].kindLabel}>
                <h3 className="mb-2 text-sm font-bold text-daet-ink/65">{group.items[0].kindLabel} <span className="font-normal">({group.items.length}{group.items.length === 12 ? "+" : ""})</span></h3>
                <ul className="divide-y divide-daet-ink/10 overflow-hidden rounded-xl border border-daet-ink/10">
                  {group.items.map((result) => (
                    <li key={`${result.kind}-${result.id}`}>
                      <Link href={result.href} className="flex min-h-16 flex-col gap-2 bg-canvas px-4 py-3 transition hover:bg-blue-50 dark:hover:bg-blue-950/40 sm:flex-row sm:items-center sm:justify-between">
                        <span className="min-w-0">
                          <span className="block truncate font-bold text-daet-ink">{result.title}</span>
                          <span className="mt-0.5 block truncate text-sm text-daet-ink/70">{result.detail}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="rounded-full bg-daet-sand px-3 py-1 text-xs font-bold text-daet-forest dark:text-blue-300">{result.status}</span>
                          <span className="text-sm font-bold text-blue-700 dark:text-blue-300">Open →</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : null}
        </section>
      ) : null}

      <section id="queues" aria-labelledby="queues-title" className="mb-8 overflow-hidden rounded-2xl card-edge bg-surface">
        <div className="p-5 pb-3 sm:p-6 sm:pb-3">
          <h2 id="queues-title" className="text-xl font-bold text-daet-ink">Waiting on the office</h2>
          <p className="mt-1 text-sm text-daet-ink/70">Applications that need a decision from the office.</p>
        </div>
        <div className="grid gap-3 px-5 pb-5 sm:grid-cols-3 sm:px-6">
          {(
            [
              { label: "Operators to review", value: pendingOperators, href: "/tours/admin/operators", live: "adminOperators" as const },
              { label: "Guides to verify", value: pendingGuides, href: "/tours/admin/guides", live: "adminGuides" as const },
              { label: "Packages to approve", value: pendingPackages, href: "/tours/admin/packages", live: "adminPackages" as const },
            ] as const
          ).map((q) => (
            <Link key={q.label} href={q.href} className="block rounded-2xl bg-canvas p-4 transition hover:bg-blue-50 dark:hover:bg-blue-950/40 active:scale-[0.99]">
              <span className="flex items-center justify-between gap-2 text-sm text-slate-600 dark:text-slate-400">
                {q.label}
                <span className="inline-flex items-center gap-1 font-bold">
                  {q.value > 0 ? <><LineIcon name="clock" className="h-4 w-4" />Waiting</> : <><LineIcon name="check" className="h-4 w-4" />All clear</>}
                </span>
              </span>
              <LiveCount name={q.live} initial={q.value} waiting className="mt-1 block text-3xl font-bold" />
              <span className="mt-1 block text-sm font-bold text-blue-700 dark:text-blue-300">{q.value > 0 ? "Review →" : "Open →"}</span>
            </Link>
          ))}
        </div>
        <p className="flex flex-wrap gap-x-6 gap-y-1 border-t border-daet-ink/10 px-5 py-3 text-sm text-daet-ink/70 sm:px-6">
          <Link href="/tours/admin/packages" className="font-bold text-blue-700 underline underline-offset-4 dark:text-blue-300">{publishedPackages} published packages</Link>
          <span>{totalBookings} bookings, all time</span>
        </p>
      </section>

      <section id="next-up" aria-labelledby="next-title" className="mb-8 overflow-hidden rounded-2xl card-edge bg-surface">
        <div className="p-5 pb-3 sm:p-6 sm:pb-3">
          <h2 id="next-title" className="text-xl font-bold text-daet-ink">Next up</h2>
          <p className="mt-1 text-sm text-daet-ink/70">Oldest first. Anything waiting 3 days or more is marked overdue.</p>
        </div>
        {nextUp.length === 0 ? (
          <p className="mx-5 mb-5 flex items-center gap-2 rounded-xl bg-canvas p-4 text-sm text-daet-ink/80 sm:mx-6 sm:mb-6">
            <LineIcon name="check" className="h-5 w-5 text-blue-700 dark:text-blue-300" />
            Nothing is waiting. New applications will show up here.
          </p>
        ) : (
          <ul className="divide-y divide-daet-ink/10 border-t border-daet-ink/10">
            {nextUp.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <Link href={item.href} className="flex min-h-16 flex-col gap-2 px-5 py-3 transition hover:bg-blue-50 dark:hover:bg-blue-950/40 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <span className="min-w-0">
                    <span className="block truncate font-bold text-daet-ink">{item.name}</span>
                    <span className="block text-sm text-daet-ink/70">{item.kind}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3 text-sm">
                    <span className={`inline-flex items-center gap-1 font-bold ${item.days >= 3 ? "text-amber-800 dark:text-amber-200" : "text-daet-ink/70"}`}>
                      <LineIcon name="clock" className="h-4 w-4" />
                      {item.days} {item.days === 1 ? "day" : "days"}{item.days >= 3 ? " · Overdue" : ""}
                    </span>
                    <span className="font-bold text-blue-700 dark:text-blue-300">Review →</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="decisions-title" className="rounded-2xl card-edge bg-surface p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="decisions-title" className="text-xl font-bold text-daet-ink">Recent decisions</h2>
          <Link href="/tours/admin/activity" className="text-sm font-bold text-blue-700 underline underline-offset-4 dark:text-blue-300">View the full activity log</Link>
        </div>
        {recentActivities && recentActivities.length > 0 ? (
          <ul className="divide-y divide-daet-ink/10">
            {recentActivities.map((activity: any) => (
              <li key={activity.id} className="flex items-start gap-3 py-3 text-sm">
                <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-daet-sand">{getActivityIcon(activity.action)}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-daet-ink">
                    {activity.profiles.full_name || "Admin"}{" "}
                    <span className="font-normal text-daet-ink/70">{getActivityDescription(activity)}</span>
                  </p>
                  <p className="mt-1 text-slate-600 dark:text-slate-400">{new Date(activity.created_at).toLocaleString()}</p>
                  {activity.notes ? <p className="mt-1 italic text-slate-600 dark:text-slate-400">“{activity.notes}”</p> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-daet-ink/70">No decisions yet.</p>
        )}
      </section>
    </AdminPage>
  );
}

function getActivityIcon(action: string): string {
  switch (action) {
    case 'approve_operator':
    case 'approve_guide':
      return '✓';
    case 'reject_operator':
    case 'reject_guide':
      return '✗';
    case 'update_package_status':
      return '•';
    case 'delete_package':
      return '−';
    case 'ban_user':
      return '×';
    case 'unban_user':
      return '✓';
    default:
      return '•';
  }
}

function getActivityDescription(activity: any): string {
  switch (activity.action) {
    case 'approve_operator':
      return 'approved an operator application';
    case 'reject_operator':
      return 'rejected an operator application';
    case 'approve_guide':
      return 'approved a guide application';
    case 'reject_guide':
      return 'rejected a guide application';
    case 'update_package_status':
      return `changed package status to ${activity.new_value}`;
    case 'delete_package':
      return 'deleted a package';
    case 'ban_user':
      return 'banned a user';
    case 'unban_user':
      return 'unbanned a user';
    default:
      return 'performed an action';
  }
}
