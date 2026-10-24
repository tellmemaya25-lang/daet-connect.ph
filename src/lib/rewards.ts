import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * CONNECT-Daet.ph Rewards Engine (shared across subsystems).
 *
 * Points live in `rewards_ledger`. Every award has a `(source, ref_id)` pair
 * that is UNIQUE, so calling addPoints twice for the same event is a no-op.
 * Clients can only read their own rows; writes need the service role. Team 8
 * (tours) awards points from database triggers so they commit with the event;
 * other subsystems call addPoints from server code. Contract: docs/SHARED_TABLES.md.
 */

export type RewardRule = { source: string; points: number; label: string };

/** Tours (Team 8) awards. Mirrors the triggers in supabase/migrations/20261103_f10_rewards.sql. */
export const TOURS_REWARD_RULES: RewardRule[] = [
  { source: "tours.booking_paid", points: 50, label: "Pay for a tour in full" },
  { source: "tours.checked_in", points: 30, label: "Check in with your guide" },
  { source: "tours.tour_completed", points: 20, label: "Complete a tour" },
  { source: "tours.review_written", points: 10, label: "Review a completed tour" },
  { source: "tours.itinerary_saved", points: 5, label: "Save a trip plan (up to 3 a day)" },
];

const SOURCE_RE = /^[a-z0-9_]+\.[a-z0-9_]+$/;

export type AddPointsResult = { ok: true; awarded: boolean } | { ok: false; error: string };

/**
 * Award (or, with negative points, deduct) points once per (source, refId).
 * `awarded` is false when the same event was already recorded.
 * Pass a service-role client (createSupabaseAdminClient); call only from server code.
 */
export async function addPoints(
  admin: SupabaseClient,
  profileId: string,
  points: number,
  source: string,
  refId: string,
  description?: string,
): Promise<AddPointsResult> {
  if (!profileId) return { ok: false, error: "Missing profile." };
  if (!Number.isInteger(points) || points === 0 || Math.abs(points) > 100_000) return { ok: false, error: "Points must be a non-zero whole number." };
  if (!SOURCE_RE.test(source)) return { ok: false, error: "Source must look like 'subsystem.event'." };
  if (!refId || refId.length > 200) return { ok: false, error: "Missing or too long reference id." };
  if (description && description.length > 200) return { ok: false, error: "Description is too long." };

  const { data, error } = await admin.rpc("rewards_add_points", {
    p_profile_id: profileId,
    p_points: points,
    p_source: source,
    p_ref_id: refId,
    p_description: description ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, awarded: data === true };
}

export type LedgerEntry = { id: string; points: number; source: string; description: string | null; created_at: string };

const LABELS: Record<string, string> = {
  "tours.booking_paid": "Tour paid",
  "tours.booking_paid_reversed": "Refund",
  "tours.checked_in": "Checked in",
  "tours.tour_completed": "Tour completed",
  "tours.review_written": "Review",
  "tours.itinerary_saved": "Trip plan saved",
};

/** Short label for a ledger source, falling back to the subsystem name. */
export function sourceLabel(source: string): string {
  if (LABELS[source]) return LABELS[source];
  const [subsystem = "", event = ""] = source.split(".");
  const words = event.replace(/_/g, " ").trim();
  return words ? `${words[0].toUpperCase()}${words.slice(1)}` : subsystem || "Points";
}

/** Balance from ledger rows (used when the balances view isn't available). */
export function balanceOf(entries: Pick<LedgerEntry, "points">[]): number {
  return entries.reduce((sum, e) => sum + (Number.isFinite(Number(e.points)) ? Number(e.points) : 0), 0);
}
