import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchTerm } from "@/components/ui/search-term";
import { bookingSearchFilter, bookingSearchPattern } from "@/lib/tours/booking-search";
import { GUIDE_SEARCH_SUPPORTED, GUIDE_SEARCH_TYPES, type GuideSearchStatus, type GuideSearchType } from "@/lib/tours/guide-search";

const LIMIT_PER_TYPE = 12;

type Kind = Exclude<GuideSearchType, "all">;
export type GuideSearchResult = { id: string; kind: Kind; kindLabel: string; title: string; detail: string; status: string; href: string };
type Batch = { results: GuideSearchResult[]; hasError: boolean };

const labels = Object.fromEntries(GUIDE_SEARCH_TYPES.map(({ value, label }) => [value, label])) as Record<GuideSearchType, string>;
const empty = (): Batch => ({ results: [], hasError: false });
const allowed = (kind: Kind, status: GuideSearchStatus) => status === "all" || GUIDE_SEARCH_SUPPORTED[kind].includes(status);
const cap = (v: unknown) => (typeof v === "string" && v ? v[0].toUpperCase() + v.slice(1).replace(/_/g, " ") : "Unknown");
const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const day = (key: string) => new Date(`${key}T00:00:00+08:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });

/** Tours assigned to this guide only, whatever the row-level rules allow. */
async function searchTours(db: SupabaseClient, guideId: string, term: string, status: GuideSearchStatus): Promise<Batch> {
  if (!allowed("tours", status)) return empty();
  const { data: pkgs, error: pkgError } = await db.from("tours_packages").select("id").ilike("title", bookingSearchPattern(term)).limit(200);
  if (pkgError) return { results: [], hasError: true };
  let query = db
    .from("tours_bookings")
    .select("id, booking_reference, contact_name, tour_date, status, tours_packages(title)")
    .eq("assigned_guide_id", guideId)
    .in("status", ["confirmed", "completed"])
    .or(bookingSearchFilter(term, (pkgs ?? []).map((p) => p.id)))
    .order("tour_date", { ascending: false })
    .limit(LIMIT_PER_TYPE);
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return { results: [], hasError: true };
  return {
    hasError: false,
    results: (data ?? []).map((row) => {
      const pkg = first(row.tours_packages as { title: string } | { title: string }[] | null);
      return {
        id: row.id,
        kind: "tours" as const,
        kindLabel: labels.tours,
        title: `${row.booking_reference} · ${row.contact_name ?? "Guest"}`,
        detail: `${pkg?.title ?? "Tour"} · ${row.tour_date ? day(row.tour_date) : "No date"}`,
        status: cap(row.status),
        href: `/tours/guide/tours/${row.id}/roster`,
      };
    }),
  };
}

async function searchOperators(db: SupabaseClient, guideId: string, term: string, status: GuideSearchStatus): Promise<Batch> {
  if (!allowed("operators", status)) return empty();
  const { data: apps, error } = await db.from("tours_guide_applications").select("operator_id, status").eq("guide_id", guideId);
  if (error) return { results: [], hasError: true };
  const ids = [...new Set((apps ?? []).map((a) => a.operator_id as string))];
  if (!ids.length) return empty();
  const { data: ops, error: opError } = await db.from("tours_operators").select("id, business_name, business_address").in("id", ids);
  const needle = term.toLowerCase();
  const statusOf = new Map((apps ?? []).map((a) => [a.operator_id as string, a.status as string]));
  const bucket = (s: string | undefined) => (s === "active" ? "active" : s === "ended" ? "ended" : "pending");
  return {
    hasError: Boolean(opError),
    results: (ops ?? [])
      .filter((o) => (o.business_name ?? "").toLowerCase().includes(needle))
      .filter((o) => status === "all" || bucket(statusOf.get(o.id)) === status)
      .slice(0, LIMIT_PER_TYPE)
      .map((o) => ({
        id: o.id,
        kind: "operators" as const,
        kindLabel: labels.operators,
        title: o.business_name,
        detail: o.business_address ?? "Operator",
        status: cap(statusOf.get(o.id)),
        href: "/tours/guide/operators",
      })),
  };
}

export async function searchGuideRecords({
  supabase,
  guideId,
  term: rawTerm,
  type,
  status,
}: {
  supabase: SupabaseClient;
  guideId: string;
  term: unknown;
  type: GuideSearchType;
  status: GuideSearchStatus;
}): Promise<{ results: GuideSearchResult[]; hasError: boolean }> {
  const term = searchTerm(rawTerm);
  if (term.length < 2) return { results: [], hasError: false };
  const include = (kind: Kind) => type === "all" || type === kind;
  const sources: Array<() => Promise<Batch>> = [];
  if (include("tours")) sources.push(() => searchTours(supabase, guideId, term, status));
  if (include("operators")) sources.push(() => searchOperators(supabase, guideId, term, status));
  const batches = await Promise.all(sources.map((s) => s()));
  return { results: batches.flatMap((b) => b.results), hasError: batches.some((b) => b.hasError) };
}
