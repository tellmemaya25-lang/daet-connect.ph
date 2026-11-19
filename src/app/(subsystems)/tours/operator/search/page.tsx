import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/ui/notice";
import { PageFrame } from "@/components/ui/page-frame";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  OPERATOR_SEARCH_STATUSES,
  OPERATOR_SEARCH_TYPES,
  parseOperatorSearchStatus,
  parseOperatorSearchType,
} from "@/lib/tours/operator-search";
import { searchOperatorRecords } from "@/lib/tours/operator-search.server";
import { getAuthenticatedSession } from "@/lib/tours/server-auth";
import { searchTerm } from "@/components/ui/search-term";

export const metadata = { title: "Search" };

const BASE = "/tours/operator/search";
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** The results of the top-bar search: matches among the operator's own records, grouped by type. */
export default async function OperatorSearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = searchTerm(one(params.q));
  const type = parseOperatorSearchType(one(params.type));
  const status = parseOperatorSearchStatus(one(params.status));

  const session = await getAuthenticatedSession();
  if (!session.user) redirect(`/login?next=${encodeURIComponent(BASE)}`);
  if (session.role !== "operator") redirect("/dashboard");
  const supabase = await createSupabaseServerClient();
  const { data: operator } = await supabase.from("tours_operators").select("id").eq("profile_id", session.user.id).maybeSingle();
  if (!operator) redirect("/tours/operator/register");

  const result = query.length >= 2 ? await searchOperatorRecords({ supabase, operatorId: operator.id, term: query, type, status }) : null;
  const groups = result
    ? OPERATOR_SEARCH_TYPES.filter((t) => t.value !== "all")
        .map((t) => ({ kind: t.value, items: result.results.filter((r) => r.kind === t.value) }))
        .filter((g) => g.items.length > 0)
    : [];

  return (
    <PageFrame>
      <Link href="/tours/operator/dashboard" className="inline-flex min-h-11 items-center text-sm font-bold text-daet-forest hover:underline dark:text-blue-300">
        ← Dashboard
      </Link>
      <h1 className="display-2 mb-2 text-daet-ink [overflow-wrap:anywhere]">{query ? `Results for “${query}”` : "Search"}</h1>
      <p className="mb-4 max-w-3xl text-sm leading-6 text-daet-ink/70">
        {OPERATOR_SEARCH_TYPES.find((t) => t.value === type)?.label}
        {" · "}
        {OPERATOR_SEARCH_STATUSES.find((s) => s.value === status)?.label}. Change the type or status in the search at the top. Only your own records are searched, up to 12 matches per type.
      </p>
      {!query || query.length < 2 ? (
        <p className="rounded-2xl bg-surface p-4 text-sm text-daet-ink/70">Enter at least 2 characters to search your bookings, packages, guides, merchandise and reviews.</p>
      ) : null}
      {result?.hasError ? (
        <Notice variant="warning" className="mb-4">
          Some record types could not be searched. The results below may be incomplete.
        </Notice>
      ) : null}
      {result && result.results.length === 0 ? <p className="rounded-2xl bg-surface p-4 text-sm text-daet-ink/70">No records match “{query}” with those filters. Try a different search or status.</p> : null}
      <div className="space-y-5">
        {groups.map((group) => (
          <section key={group.kind} aria-label={group.items[0].kindLabel} className="min-w-0">
            <h2 className="mb-2 text-sm font-bold text-daet-ink/65">
              {group.items[0].kindLabel} <span className="font-normal">({group.items.length}{group.items.length === 12 ? "+" : ""})</span>
            </h2>
            <ul className="divide-y divide-daet-ink/10 overflow-hidden rounded-xl border border-daet-ink/10">
              {group.items.map((r) => (
                <li key={`${r.kind}-${r.id}`}>
                  <Link href={r.href} className="flex min-h-16 flex-col gap-2 bg-surface px-4 py-3 transition hover:bg-blue-50 dark:hover:bg-blue-950/40 sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0">
                      <span className="block truncate font-bold text-daet-ink">{r.title}</span>
                      <span className="mt-0.5 block truncate text-sm text-daet-ink/70">{r.detail}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-daet-sand px-3 py-1 text-xs font-bold text-daet-forest dark:text-blue-300">{r.status}</span>
                      <span className="text-sm font-bold text-blue-700 dark:text-blue-300">Open →</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </PageFrame>
  );
}
