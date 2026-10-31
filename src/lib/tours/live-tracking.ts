/**
 * Pure rules for live tour tracking, shared by the guide, operator and
 * tourist screens. The database enforces who may share and when
 * (supabase/migrations/20261114_live_tracking.sql); these decide how often a
 * phone sends, when a dot counts as paused, and when to raise the
 * away-from-group alert.
 */
import { haversineMeters, type LatLng } from "@/lib/maps/geo";

/** Send at most this often while standing still... */
export const SEND_EVERY_MS = 20_000;
/** ...or sooner after moving this far (but never faster than the server allows). */
export const SEND_AFTER_MOVE_M = 25;
export const SERVER_MIN_GAP_MS = 10_000;
/** A dot with no update for this long is shown as paused ("last seen"). */
export const STALE_AFTER_MS = 2 * 60_000;
/** Away-from-group alert: farther than this from the guide... */
export const DRIFT_ALERT_M = 300;
/** ...for at least this long. */
export const DRIFT_ALERT_MS = 2 * 60_000;
/** Readings worse than this are shown as weak. */
export const WEAK_ACCURACY_M = 100;

export type Fix = LatLng & { at: number; accuracy?: number | null };

export function shouldSend(last: Fix | null, next: Fix): boolean {
  if (!last) return true;
  const elapsed = next.at - last.at;
  if (elapsed >= SEND_EVERY_MS) return true;
  return elapsed >= SERVER_MIN_GAP_MS && haversineMeters(last, next) >= SEND_AFTER_MOVE_M;
}

export function isStale(updatedAt: string | number, now: number): boolean {
  return now - new Date(updatedAt).getTime() >= STALE_AFTER_MS;
}

export function lastSeenLabel(updatedAt: string | number, now: number): string {
  const minutes = Math.floor((now - new Date(updatedAt).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ago`;
}

/**
 * Tracks how long a guest has been out of range. Pass the previous value and
 * the current distance; returns when they went out of range, or null when
 * they are back within range (or either position is unknown).
 */
export function awaySince(previous: number | null, distanceM: number | null, now: number): number | null {
  if (distanceM === null || distanceM <= DRIFT_ALERT_M) return null;
  return previous ?? now;
}

export function driftAlert(since: number | null, now: number): boolean {
  return since !== null && now - since >= DRIFT_ALERT_MS;
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export type PingReason = "ok" | "throttled" | "not_live" | "no_consent" | "closed";

/** What the sharing banner says after a ping. */
export function pingMessage(reason: PingReason | string | undefined): string | null {
  switch (reason) {
    case "ok":
    case "throttled":
      return null;
    case "not_live":
      return "The live tour hasn't started yet.";
    case "no_consent":
      return "Sharing is off.";
    case "closed":
      return "Sharing is closed for this tour.";
    default:
      return "Your location couldn't be sent. It will try again.";
  }
}

export function formatClock(value: string | number | Date): string {
  return new Date(value).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" });
}
