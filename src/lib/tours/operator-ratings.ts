import type { SupabaseClient } from "@supabase/supabase-js";
import { toSummary, type RatingSummary } from "@/lib/tours/reviews";

/**
 * Tours show their operator's rating across all their trips (owner's request:
 * operator reviews, not package reviews). From the tours_operator_ratings view,
 * so hidden reviews never count. Keyed by package id; packages whose operator
 * has no reviews yet are left out. Empty when the ratings can't be read.
 */
export async function operatorRatingsByPackage(supabase: SupabaseClient, packageIds: string[]): Promise<Map<string, RatingSummary>> {
  const result = new Map<string, RatingSummary>();
  if (!packageIds.length) return result;
  const { data: packages, error } = await supabase.from("tours_packages").select("id, operator_id").in("id", packageIds);
  if (error || !packages?.length) return result;
  const operatorIds = [...new Set(packages.map((p) => p.operator_id as string | null).filter((id): id is string => Boolean(id)))];
  if (!operatorIds.length) return result;
  const { data: ratings } = await supabase.from("tours_operator_ratings").select("operator_id, review_count, average_rating").in("operator_id", operatorIds);
  const byOperator = new Map<string, RatingSummary>();
  for (const row of ratings ?? []) {
    const summary = toSummary(row);
    if (row.operator_id && summary) byOperator.set(row.operator_id as string, summary);
  }
  for (const p of packages) {
    const summary = p.operator_id ? byOperator.get(p.operator_id as string) : undefined;
    if (summary) result.set(p.id as string, summary);
  }
  return result;
}
