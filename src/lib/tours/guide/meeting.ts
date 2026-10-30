import type { LatLng } from "@/lib/maps/geo";

/**
 * Where a tour's guests meet: the operator's meeting point when set, else
 * the first stop, else the tour's area. Time is "HH:MM" (Manila).
 */
export type MeetingPoint = { name: string; point: LatLng | null; time: string | null; fromStop: boolean };

type PackageMeeting = {
  location_name: string;
  meeting_point_name?: string | null;
  meeting_lat?: number | string | null;
  meeting_lng?: number | string | null;
  meeting_time?: string | null;
};
type Stop = { location_name: string; lat?: number | null; lng?: number | null; stop_order?: number | null };

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export function meetingPointOf(pkg: PackageMeeting, stops: Stop[] = []): MeetingPoint {
  const time = pkg.meeting_time ? pkg.meeting_time.slice(0, 5) : null;
  const lat = num(pkg.meeting_lat);
  const lng = num(pkg.meeting_lng);
  if (pkg.meeting_point_name?.trim()) {
    return { name: pkg.meeting_point_name.trim(), point: lat !== null && lng !== null ? { lat, lng } : null, time, fromStop: false };
  }
  const first = [...stops].sort((a, b) => (a.stop_order ?? 0) - (b.stop_order ?? 0))[0];
  if (first) {
    const point = first.lat != null && first.lng != null ? { lat: Number(first.lat), lng: Number(first.lng) } : null;
    return { name: first.location_name, point, time, fromStop: true };
  }
  return { name: pkg.location_name, point: null, time, fromStop: true };
}

/** "6:30 AM" from "06:30". */
export function meetingTimeLabel(time: string | null): string | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const suffix = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`;
}
