/**
 * Friends and plans shared between them (20261210). Parsers for the RPCs'
 * JSON, kept forgiving: anything malformed is dropped, never thrown.
 */

export type FriendStatus = "none" | "requested" | "incoming" | "friends";
export type Person = { id: string; name: string; avatarUrl: string | null };
export type FoundPerson = Person & { status: FriendStatus };
export type FriendLists = { friends: Person[]; incoming: Person[]; outgoing: Person[] };
export type SharedPlan = { id: string; title: string; startDate: string | null; endDate: string | null; owner: string; sharedAt: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : []);
const str = (v: unknown) => (typeof v === "string" ? v : null);

function person(r: Record<string, unknown>): Person | null {
  const id = str(r.id);
  if (!id || !UUID.test(id)) return null;
  return { id, name: str(r.name)?.trim() || "Traveller", avatarUrl: str(r.avatar_url) };
}

const people = (v: unknown) => list(v).map(person).filter((p): p is Person => p !== null);

export function parseFriendLists(data: unknown): FriendLists {
  const d = (data ?? {}) as Record<string, unknown>;
  return { friends: people(d.friends), incoming: people(d.incoming), outgoing: people(d.outgoing) };
}

const STATUSES: FriendStatus[] = ["none", "requested", "incoming", "friends"];

export function parseFoundPeople(data: unknown): FoundPerson[] {
  return list(data)
    .map((r) => {
      const p = person(r);
      const status = STATUSES.includes(r.status as FriendStatus) ? (r.status as FriendStatus) : "none";
      return p ? { ...p, status } : null;
    })
    .filter((p): p is FoundPerson => p !== null);
}

export function parseSharedPlans(data: unknown): SharedPlan[] {
  return list(data)
    .map((r) => {
      const id = str(r.id);
      if (!id || !UUID.test(id)) return null;
      return { id, title: str(r.title) || "Trip plan", startDate: str(r.start_date), endDate: str(r.end_date), owner: str(r.owner) || "A friend", sharedAt: str(r.shared_at) };
    })
    .filter((p): p is SharedPlan => p !== null);
}

/** What a search is worth sending: 3 to 120 characters. Empty means no search. */
export function cleanSearch(q: unknown): string {
  const text = typeof q === "string" ? q.trim() : "";
  return text.length >= 3 && text.length <= 120 ? text : "";
}

export const isProfileId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}
