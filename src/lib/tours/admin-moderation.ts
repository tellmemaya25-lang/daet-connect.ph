/**
 * Admin moderation, revenue and the activity log (20261211): parsers for the
 * RPCs' JSON and the labels the screens use. Malformed rows are dropped.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : []);
const str = (v: unknown) => (typeof v === "string" ? v : null);
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

// Reports --------------------------------------------------------------------

export const REPORT_REASONS = [
  { value: "scam", label: "Scam or asking to pay outside the app" },
  { value: "unsafe", label: "Unsafe or harmful" },
  { value: "abuse", label: "Abusive or harassing" },
  { value: "fake", label: "Fake or misleading" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["value"];
export type ReportTarget = "review" | "profile" | "package";
export type ReportStatus = "open" | "actioned" | "dismissed";

export const reasonLabel = (r: string) => REPORT_REASONS.find((x) => x.value === r)?.label ?? r;
export const isReportReason = (v: unknown): v is ReportReason => REPORT_REASONS.some((r) => r.value === v);
export const isReportTarget = (v: unknown): v is ReportTarget => v === "review" || v === "profile" || v === "package";

export type AdminReport = {
  id: string;
  type: ReportTarget;
  targetId: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  note: string | null;
  createdAt: string;
  reporter: string;
  targetProfileId: string | null;
  targetName: string;
  targetRole: string | null;
  targetSuspended: boolean;
  openOnTarget: number;
  review: { rating: number; comment: string | null; hidden: boolean; about: string } | null;
  pkg: { title: string; status: string } | null;
};

export function parseReports(data: unknown): AdminReport[] {
  return list(data)
    .map((r): AdminReport | null => {
      const id = str(r.id);
      const type = r.type;
      if (!id || !UUID.test(id) || !isReportTarget(type)) return null;
      const s = obj(r.summary);
      const status = r.status === "actioned" || r.status === "dismissed" ? r.status : "open";
      return {
        id,
        type,
        targetId: str(r.target_id) ?? "",
        reason: str(r.reason) ?? "other",
        details: str(r.details),
        status,
        note: str(r.note),
        createdAt: str(r.created_at) ?? "",
        reporter: str(r.reporter) || "Someone",
        targetProfileId: str(r.target_profile_id),
        targetName: str(r.target_name) || "—",
        targetRole: str(r.target_role),
        targetSuspended: r.target_suspended === true,
        openOnTarget: Math.trunc(num(r.open_on_target)),
        review: type === "review" && Object.keys(s).length ? { rating: Math.trunc(num(s.rating)), comment: str(s.comment), hidden: s.hidden === true, about: str(s.about) || "Operator" } : null,
        pkg: type === "package" && Object.keys(s).length ? { title: str(s.title) || "Package", status: str(s.status) || "" } : null,
      };
    })
    .filter((r): r is AdminReport => r !== null);
}

/** Ban lengths the admin can pick. null = until lifted. */
export const BAN_CHOICES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: null, label: "Until lifted" },
] as const;

/** Supabase Auth's ban_duration for a ban of `days` (null = about 100 years). */
export function banDuration(days: number | null): string {
  return days === null ? "876000h" : `${Math.round(days * 24)}h`;
}

// Review watch ---------------------------------------------------------------------

export type WatchRow = { id: string; profileId: string | null; name: string; suspended: boolean; reviews: number; average: number | null; low: number; hidden: number; openReports: number };
export type LowReview = { id: string; rating: number; comment: string | null; hidden: boolean; createdAt: string; operator: string; guide: string | null; pkg: string; reply: string | null };
export type ReviewWatch = { operators: WatchRow[]; guides: WatchRow[]; lowReviews: LowReview[] };

function watchRow(r: Record<string, unknown>): WatchRow | null {
  const id = str(r.id);
  if (!id) return null;
  return {
    id,
    profileId: str(r.profile_id),
    name: str(r.name) || "—",
    suspended: r.suspended === true,
    reviews: Math.trunc(num(r.reviews)),
    average: r.average === null || r.average === undefined ? null : num(r.average),
    low: Math.trunc(num(r.low)),
    hidden: Math.trunc(num(r.hidden)),
    openReports: Math.trunc(num(r.open_reports)),
  };
}

export function parseReviewWatch(data: unknown): ReviewWatch {
  const d = obj(data);
  return {
    operators: list(d.operators).map(watchRow).filter((r): r is WatchRow => r !== null),
    guides: list(d.guides).map(watchRow).filter((r): r is WatchRow => r !== null),
    lowReviews: list(d.low_reviews)
      .map((r) => {
        const id = str(r.id);
        if (!id) return null;
        return { id, rating: Math.trunc(num(r.rating)), comment: str(r.comment), hidden: r.hidden === true, createdAt: str(r.created_at) ?? "", operator: str(r.operator) || "Operator", guide: str(r.guide), pkg: str(r.package) || "Tour", reply: str(r.reply) };
      })
      .filter((r): r is LowReview => r !== null),
  };
}

// Revenue -------------------------------------------------------------------------------

export type AdminRevenue = {
  bookings: number;
  guests: number;
  booked: number;
  averageBooking: number;
  collected: number;
  refunded: number;
  pendingPayments: number;
  statuses: { status: string; count: number; amount: number }[];
  methods: { method: string; count: number; amount: number }[];
  months: { month: string; booked: number; collected: number; refunded: number }[];
  topPackages: { id: string; title: string; operator: string; bookings: number; booked: number }[];
};

export function parseAdminRevenue(data: unknown): AdminRevenue {
  const d = obj(data);
  return {
    bookings: Math.trunc(num(d.bookings)),
    guests: Math.trunc(num(d.guests)),
    booked: num(d.booked),
    averageBooking: num(d.average_booking),
    collected: num(d.collected),
    refunded: num(d.refunded),
    pendingPayments: num(d.pending_payments),
    statuses: list(d.statuses).map((s) => ({ status: str(s.status) || "unknown", count: Math.trunc(num(s.count)), amount: num(s.amount) })),
    methods: list(d.methods).map((m) => ({ method: str(m.method) || "other", count: Math.trunc(num(m.count)), amount: num(m.amount) })),
    months: list(d.months)
      .map((m) => ({ month: str(m.month) || "", booked: num(m.booked), collected: num(m.collected), refunded: num(m.refunded) }))
      .filter((m) => /^\d{4}-\d{2}$/.test(m.month))
      .sort((a, b) => a.month.localeCompare(b.month)),
    topPackages: list(d.top_packages).map((p) => ({ id: str(p.id) || "", title: str(p.title) || "Package", operator: str(p.operator) || "", bookings: Math.trunc(num(p.bookings)), booked: num(p.booked) })),
  };
}

const METHOD_LABELS: Record<string, string> = { gcash: "GCash", cash: "Cash", card: "Card", bank_transfer: "Bank transfer", paymongo: "PayMongo", maya: "Maya", other: "Other" };
export const methodLabel = (m: string) => METHOD_LABELS[m] ?? m.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Cancelled share of all bookings in the range, 0..100. */
export function cancellationRate(statuses: AdminRevenue["statuses"]): number {
  const total = statuses.reduce((s, x) => s + x.count, 0);
  const cancelled = statuses.filter((x) => x.status === "cancelled").reduce((s, x) => s + x.count, 0);
  return total ? Math.round((cancelled / total) * 1000) / 10 : 0;
}

// Activity log ----------------------------------------------------------------------------

export const ACTIVITY_ENTITIES: { value: string; label: string }[] = [
  { value: "tours_bookings", label: "Bookings" },
  { value: "tours_payments", label: "Payments" },
  { value: "tours_booking_payments", label: "Payment proofs" },
  { value: "tours_packages", label: "Packages" },
  { value: "tours_reviews", label: "Reviews" },
  { value: "tours_reports", label: "Reports" },
  { value: "profiles", label: "Accounts" },
  { value: "tours_operators", label: "Operators" },
  { value: "tours_guides", label: "Guides" },
  { value: "tours_guide_applications", label: "Guide applications" },
  { value: "tours_guide_swap_requests", label: "Guide swaps" },
  { value: "tours_package_guides", label: "Package guides" },
  { value: "tours_guide_availability", label: "Guide schedules" },
  { value: "tours_itineraries", label: "Trip plans" },
  { value: "tours_itinerary_shares", label: "Shared plans" },
  { value: "tours_friendships", label: "Friends" },
  { value: "tours_attractions", label: "Places" },
  { value: "tours_events", label: "Events" },
  { value: "admin_action", label: "Admin actions" },
];
/** The areas an operator's own activity log covers (tours_operator_activity). */
export const OPERATOR_ACTIVITY_ENTITIES = ACTIVITY_ENTITIES.filter((e) =>
  ["tours_bookings", "tours_payments", "tours_packages", "tours_package_guides", "tours_guide_applications"].includes(e.value),
);

/** The areas a guide's own activity log covers (tours_guide_activity). */
export const GUIDE_ACTIVITY_ENTITIES = ACTIVITY_ENTITIES.filter((e) =>
  ["tours_bookings", "tours_guide_applications", "tours_guide_swap_requests", "tours_guide_availability"].includes(e.value),
);

export const ACTIVITY_ROLES = ["admin", "operator", "guide", "tourist", "system"] as const;

export const entityLabel = (e: string) => ACTIVITY_ENTITIES.find((x) => x.value === e)?.label ?? e;
export const isActivityEntity = (v: unknown): v is string => typeof v === "string" && ACTIVITY_ENTITIES.some((x) => x.value === v);
export const isActivityRole = (v: unknown): v is (typeof ACTIVITY_ROLES)[number] => typeof v === "string" && (ACTIVITY_ROLES as readonly string[]).includes(v);

export type ActivityEntry = {
  id: string;
  at: string;
  actorId: string | null;
  actorRole: string;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  changes: Record<string, unknown>;
  notes: string | null;
};

export function parseActivity(data: unknown): ActivityEntry[] {
  return list(data)
    .map((r) => {
      const id = str(r.id);
      const at = str(r.at);
      if (!id || !at) return null;
      return {
        id,
        at,
        actorId: str(r.actor_id),
        actorRole: str(r.actor_role) || "system",
        actorName: str(r.actor_name),
        action: str(r.action) || "update",
        entity: str(r.entity) || "",
        entityId: str(r.entity_id),
        changes: obj(r.changes),
        notes: str(r.notes),
      };
    })
    .filter((r): r is ActivityEntry => r !== null);
}

const VERBS: Record<string, string> = { insert: "created", update: "changed", delete: "deleted" };

/** One line for an entry, e.g. "changed a booking: status → confirmed". */
export function describeActivity(e: ActivityEntry): string {
  if (e.entity === "admin_action") {
    const what = e.action.replace(/_/g, " ");
    return e.notes ? `${what}: ${e.notes}` : what;
  }
  const noun = entityLabel(e.entity).toLowerCase().replace(/s$/, "");
  const verb = VERBS[e.action] ?? e.action;
  if (e.action !== "update") return `${verb} a ${noun}`;
  const keys = Object.keys(e.changes).filter((k) => k !== "_columns");
  const cols = Array.isArray(e.changes._columns) ? (e.changes._columns as unknown[]).filter((c): c is string => typeof c === "string") : [];
  const parts = keys.slice(0, 3).map((k) => `${k.replace(/_/g, " ")} → ${short(e.changes[k])}`);
  const more = keys.length > 3 ? `, +${keys.length - 3} more` : cols.length ? `: ${cols.slice(0, 4).join(", ").replace(/_/g, " ")}` : "";
  return `${verb} a ${noun}${parts.length ? `: ${parts.join(", ")}` : ""}${more}`;
}

function short(v: unknown): string {
  if (v === null || v === undefined) return "empty";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 40 ? `${s.slice(0, 39)}…` : s;
}
