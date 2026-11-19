import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchTerm } from "@/components/ui/search-term";
import { bookingSearchFilter, bookingSearchPattern } from "@/lib/tours/booking-search";
import { MERCH_CATEGORIES, MERCH_REVIEW_LABELS } from "@/lib/tours/promo-validation";
import {
  OPERATOR_SEARCH_SUPPORTED,
  OPERATOR_SEARCH_TYPES,
  type OperatorSearchStatus,
  type OperatorSearchType,
} from "@/lib/tours/operator-search";

const LIMIT_PER_TYPE = 12;

type Kind = Exclude<OperatorSearchType, "all">;
export type OperatorSearchResult = {
  id: string;
  kind: Kind;
  kindLabel: string;
  title: string;
  detail: string;
  status: string;
  href: string;
};
type Batch = { results: OperatorSearchResult[]; hasError: boolean };

const labels = Object.fromEntries(OPERATOR_SEARCH_TYPES.map(({ value, label }) => [value, label])) as Record<OperatorSearchType, string>;
const empty = (): Batch => ({ results: [], hasError: false });
const allowed = (kind: Kind, status: OperatorSearchStatus) => status === "all" || OPERATOR_SEARCH_SUPPORTED[kind].includes(status);
const cap = (v: unknown) => (typeof v === "string" && v ? v[0].toUpperCase() + v.slice(1).replace(/_/g, " ") : "Unknown");
const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const day = (key: string) => new Date(`${key}T00:00:00+08:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });

/** Every query below is limited to the operator's own records, whatever the row-level rules allow. */
async function searchBookings(db: SupabaseClient, operatorId: string, term: string, status: OperatorSearchStatus): Promise<Batch> {
  if (!allowed("bookings", status)) return empty();
  const { data: pkgs, error: pkgError } = await db.from("tours_packages").select("id").eq("operator_id", operatorId).ilike("title", bookingSearchPattern(term));
  if (pkgError) return { results: [], hasError: true };
  let query = db
    .from("tours_bookings")
    .select("id, booking_reference, contact_name, tour_date, status, tours_packages!inner(title, operator_id)")
    .eq("tours_packages.operator_id", operatorId)
    .or(bookingSearchFilter(term, (pkgs ?? []).map((p) => p.id)))
    .order("created_at", { ascending: false })
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
        kind: "bookings" as const,
        kindLabel: labels.bookings,
        title: `${row.booking_reference} · ${row.contact_name ?? "Guest"}`,
        detail: `${pkg?.title ?? "Tour"} · ${row.tour_date ? day(row.tour_date) : "No date"}`,
        status: cap(row.status),
        href: `/tours/operator/bookings?q=${encodeURIComponent(row.booking_reference)}`,
      };
    }),
  };
}

async function searchPackages(db: SupabaseClient, operatorId: string, term: string, status: OperatorSearchStatus): Promise<Batch> {
  if (!allowed("packages", status)) return empty();
  let query = db.from("tours_packages").select("id, title, status").eq("operator_id", operatorId).ilike("title", bookingSearchPattern(term)).order("created_at", { ascending: false }).limit(LIMIT_PER_TYPE);
  if (status === "pending") query = query.in("status", ["pending", "pending_review"]);
  else if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return { results: [], hasError: true };
  return {
    hasError: false,
    results: (data ?? []).map((row) => ({
      id: row.id,
      kind: "packages" as const,
      kindLabel: labels.packages,
      title: row.title,
      detail: "Tour package",
      status: row.status === "pending_review" ? "Pending review" : cap(row.status),
      href: `/tours/operator/packages/${row.id}`,
    })),
  };
}

async function searchGuides(db: SupabaseClient, operatorId: string, term: string, status: OperatorSearchStatus): Promise<Batch> {
  if (!allowed("guides", status)) return empty();
  let apps = db.from("tours_guide_applications").select("guide_id, status").eq("operator_id", operatorId).in("status", ["active", "ended"]);
  if (status !== "all") apps = apps.eq("status", status);
  const { data: rows, error } = await apps;
  if (error) return { results: [], hasError: true };
  const guideIds = [...new Set((rows ?? []).map((r) => r.guide_id as string))];
  if (!guideIds.length) return empty();
  const { data: guides, error: guideError } = await db.from("tours_guides").select("id, profile_id, contact_phone").in("id", guideIds);
  const profileIds = (guides ?? []).map((g) => g.profile_id).filter(Boolean);
  const { data: profiles, error: profileError } = profileIds.length ? await db.from("profiles").select("id, full_name").in("id", profileIds) : { data: [], error: null };
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name?.trim() || "Guide"]));
  const needle = term.toLowerCase();
  const statusOf = new Map((rows ?? []).map((r) => [r.guide_id as string, r.status as string]));
  return {
    hasError: Boolean(guideError || profileError),
    results: (guides ?? [])
      .map((g) => ({ g, name: names.get(g.profile_id) ?? "Guide" }))
      .filter(({ g, name }) => name.toLowerCase().includes(needle) || (g.contact_phone ?? "").toLowerCase().includes(needle))
      .slice(0, LIMIT_PER_TYPE)
      .map(({ g, name }) => ({
        id: g.id,
        kind: "guides" as const,
        kindLabel: labels.guides,
        title: name,
        detail: g.contact_phone ?? "Guide",
        status: statusOf.get(g.id) === "active" ? "On your team" : "Ended",
        href: statusOf.get(g.id) === "active" ? `/tours/operator/guides/${g.id}` : "/tours/operator/guides",
      })),
  };
}

async function searchMerchandise(db: SupabaseClient, operatorId: string, term: string, status: OperatorSearchStatus): Promise<Batch> {
  if (!allowed("merchandise", status)) return empty();
  const pattern = bookingSearchPattern(term).replace(/"/g, "");
  let query = db
    .from("tours_merchandise")
    .select("id, name, category, seller_name, review_status, is_active")
    .eq("submitted_by_operator_id", operatorId)
    .or(`name.ilike.${pattern},seller_name.ilike.${pattern}`)
    .order("created_at", { ascending: false })
    .limit(LIMIT_PER_TYPE);
  if (status !== "all") query = query.eq("review_status", status);
  const { data, error } = await query;
  if (error) return { results: [], hasError: true };
  return {
    hasError: false,
    results: (data ?? []).map((row) => ({
      id: row.id,
      kind: "merchandise" as const,
      kindLabel: labels.merchandise,
      title: row.name,
      detail: `${MERCH_CATEGORIES[row.category as keyof typeof MERCH_CATEGORIES] ?? row.category} · ${row.seller_name}`,
      status: `${MERCH_REVIEW_LABELS[row.review_status as keyof typeof MERCH_REVIEW_LABELS] ?? cap(row.review_status)} · ${row.is_active ? "Visible" : "Hidden"}`,
      href: `/tours/operator/merch/${row.id}/edit`,
    })),
  };
}

async function searchReviews(db: SupabaseClient, operatorId: string, term: string, status: OperatorSearchStatus): Promise<Batch> {
  if (!allowed("reviews", status)) return empty();
  const pattern = bookingSearchPattern(term);
  const { data: pkgs, error: pkgError } = await db.from("tours_packages").select("id").eq("operator_id", operatorId).ilike("title", pattern);
  const pkgIds = (pkgs ?? []).map((p) => p.id);
  const quoted = `"${pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  let query = db
    .from("tours_reviews")
    .select("id, rating, comment, is_hidden, created_at, tours_packages(title)")
    .eq("operator_id", operatorId)
    .or([`comment.ilike.${quoted}`, ...(pkgIds.length ? [`package_id.in.(${pkgIds.join(",")})`] : [])].join(","))
    .order("created_at", { ascending: false })
    .limit(LIMIT_PER_TYPE);
  if (status === "hidden") query = query.eq("is_hidden", true);
  if (status === "visible") query = query.eq("is_hidden", false);
  const { data, error } = await query;
  if (error) return { results: [], hasError: true };
  return {
    hasError: Boolean(pkgError),
    results: (data ?? []).map((row) => {
      const pkg = first(row.tours_packages as { title: string } | { title: string }[] | null);
      const excerpt = (row.comment ?? "Rating only").replace(/\s+/g, " ").slice(0, 120);
      return {
        id: row.id,
        kind: "reviews" as const,
        kindLabel: labels.reviews,
        title: pkg?.title ?? "Tour review",
        detail: `${row.rating} star${row.rating === 1 ? "" : "s"} · ${excerpt}`,
        status: row.is_hidden ? "Hidden" : "Visible",
        href: "/tours/operator/reviews",
      };
    }),
  };
}

export async function searchOperatorRecords({
  supabase,
  operatorId,
  term: rawTerm,
  type,
  status,
}: {
  supabase: SupabaseClient;
  operatorId: string;
  term: unknown;
  type: OperatorSearchType;
  status: OperatorSearchStatus;
}): Promise<{ results: OperatorSearchResult[]; hasError: boolean }> {
  const term = searchTerm(rawTerm);
  if (term.length < 2) return { results: [], hasError: false };
  const include = (kind: Kind) => type === "all" || type === kind;
  const sources: Array<() => Promise<Batch>> = [];
  if (include("bookings")) sources.push(() => searchBookings(supabase, operatorId, term, status));
  if (include("packages")) sources.push(() => searchPackages(supabase, operatorId, term, status));
  if (include("guides")) sources.push(() => searchGuides(supabase, operatorId, term, status));
  if (include("merchandise")) sources.push(() => searchMerchandise(supabase, operatorId, term, status));
  if (include("reviews")) sources.push(() => searchReviews(supabase, operatorId, term, status));
  const batches = await Promise.all(sources.map((search) => search()));
  return { results: batches.flatMap((b) => b.results), hasError: batches.some((b) => b.hasError) };
}
