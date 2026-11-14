/**
 * Guide applications to operators (owner's request): apply → interview →
 * offer of a % of the tour price → accepted agreement. Only guides with an
 * active agreement can be assigned to that operator's tours; the database
 * enforces the steps (supabase/migrations/20261207_guide_operator_applications.sql).
 */

export const APPLICATION_STATUSES = [
  "applied",
  "interview_scheduled",
  "interview_passed",
  "offered",
  "active",
  "rejected",
  "offer_declined",
  "withdrawn",
  "ended",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type GuideApplication = {
  id: string;
  guideId: string;
  operatorId: string;
  status: ApplicationStatus;
  message: string | null;
  interviewAt: string | null;
  interviewPlace: string | null;
  interviewLink: string | null;
  interviewConfirmed: boolean;
  interviewNotes: string | null;
  /** The agreed share while active; null for a carried-over guide still on the package's fixed fee. */
  sharePct: number | null;
  /** An offer the guide hasn't answered (a first offer, or a new share while active). */
  offeredPct: number | null;
  decidedNote: string | null;
  updatedAt: string;
};

export const APPLICATION_COLUMNS =
  "id, guide_id, operator_id, status, message, interview_at, interview_place, interview_link, interview_confirmed_at, interview_notes, revenue_share_pct, offered_share_pct, decided_note, updated_at";

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const pct = (v: unknown) => {
  const n = v === null || v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function parseApplication(row: Record<string, unknown>): GuideApplication | null {
  const status = row.status as ApplicationStatus;
  if (typeof row.id !== "string" || !APPLICATION_STATUSES.includes(status)) return null;
  return {
    id: row.id,
    guideId: String(row.guide_id ?? ""),
    operatorId: String(row.operator_id ?? ""),
    status,
    message: str(row.message),
    interviewAt: str(row.interview_at),
    interviewPlace: str(row.interview_place),
    interviewLink: str(row.interview_link),
    interviewConfirmed: Boolean(row.interview_confirmed_at),
    interviewNotes: str(row.interview_notes),
    sharePct: pct(row.revenue_share_pct),
    offeredPct: pct(row.offered_share_pct),
    decidedNote: str(row.decided_note),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export function parseApplications(rows: unknown): GuideApplication[] {
  return (Array.isArray(rows) ? rows : []).flatMap((r) => (r && typeof r === "object" ? [parseApplication(r as Record<string, unknown>)].filter((a): a is GuideApplication => a !== null) : []));
}

/** "30%", "12.5%". */
export function pctText(value: number): string {
  return `${Number(value.toFixed(2))}%`;
}

/** The guide's pay on a tour at this share: % of the tour price, pickup fees excluded (as the database works it out). */
export function shareOf(pctValue: number, tourPrice: number): number {
  return Math.round((pctValue / 100) * Math.max(tourPrice, 0) * 100) / 100;
}

/** Closed applications a guide can apply to again. */
export const REAPPLY_STATUSES: ReadonlySet<ApplicationStatus> = new Set(["rejected", "offer_declined", "withdrawn", "ended"]);
/** Still in progress: shown at the top of both pages. */
export const OPEN_STATUSES: ReadonlySet<ApplicationStatus> = new Set(["applied", "interview_scheduled", "interview_passed", "offered", "offer_declined"]);

/** One line on where the application stands, worded for the guide. */
export function guideStatusText(a: GuideApplication): string {
  switch (a.status) {
    case "applied":
      return "Applied. Waiting for the operator to set an interview.";
    case "interview_scheduled":
      return a.interviewConfirmed ? "Interview set. You confirmed you'll attend." : "Interview set. Please confirm you'll attend.";
    case "interview_passed":
      return "You passed the interview. Waiting for the operator's offer.";
    case "offered":
      return `Offer: ${pctText(a.offeredPct ?? 0)} of the tour price.`;
    case "active":
      return a.sharePct ? `You guide their tours for ${pctText(a.sharePct)} of the tour price.` : "You guide their tours on each package's fixed guide fee until you agree a share.";
    case "offer_declined":
      return "You declined the offer. The operator can send a new one.";
    case "rejected":
      return "Not accepted this time.";
    case "withdrawn":
      return "You withdrew this application.";
    case "ended":
      return "Your agreement ended.";
  }
}

/** One line on where the application stands, worded for the operator. */
export function operatorStatusText(a: GuideApplication): string {
  switch (a.status) {
    case "applied":
      return "New application. Set up an interview, or decline.";
    case "interview_scheduled":
      return a.interviewConfirmed ? "Interview set; the guide confirmed." : "Interview set; waiting for the guide to confirm.";
    case "interview_passed":
      return "Passed the interview. Offer a share of the tour price.";
    case "offered":
      return `Offered ${pctText(a.offeredPct ?? 0)}; waiting for the guide.`;
    case "active":
      return a.sharePct ? `On your team at ${pctText(a.sharePct)} of the tour price.` : "On your team on each package's fixed guide fee (no share agreed yet).";
    case "offer_declined":
      return "Declined your offer. You can offer a different share.";
    case "rejected":
      return "Not accepted.";
    case "withdrawn":
      return "The guide withdrew.";
    case "ended":
      return "Agreement ended.";
  }
}

/**
 * A `datetime-local` value ("2026-12-01T14:30") read as Manila time, as an
 * ISO timestamp; null when it isn't a real date and time.
 */
export function manilaLocalToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const utc = Date.UTC(y, mo - 1, d, h - 8, mi);
  const check = new Date(utc + 8 * 3600_000);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || check.getUTCHours() !== h) return null;
  return new Date(utc).toISOString();
}

/** "Tue, Dec 1, 2:30 PM" in Manila time. */
export function interviewTimeText(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
}

/** A share typed by the operator: more than 0 and at most 100, two decimals at most. */
export function parseSharePct(input: string): { ok: true; value: number } | { ok: false; error: string } {
  const text = input.trim().replace(/%$/, "").trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return { ok: false, error: "Enter a number like 30 or 12.5." };
  const value = Number(text);
  if (value <= 0 || value > 100) return { ok: false, error: "The share must be more than 0% and at most 100%." };
  return { ok: true, value };
}
