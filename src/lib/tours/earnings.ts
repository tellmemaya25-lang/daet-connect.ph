/**
 * Earnings and revenue per role (owner's list, item 6), from tours_earnings().
 *
 *   guide:    earned = guide fees on completed tours; expected = on confirmed ones.
 *   operator: booked (confirmed + completed totals), collected and refunded
 *             (payments in the range), guide fees owed on completed tours,
 *             net = collected - refunded - guide fees.
 *   admin:    the operator figures for every operator, plus guides.
 */

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const int = (v: unknown) => Math.trunc(num(v));
const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : []);

export type GuideTour = { id: string; reference: string; date: string; title: string; pax: number; status: string; fee: number | null };
export type GuideEarnings = {
  completedTours: number;
  earned: number;
  upcomingTours: number;
  expected: number;
  unpricedTours: number;
  tours: GuideTour[];
};

export function parseGuideEarnings(data: unknown): GuideEarnings {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    completedTours: int(d.completed_tours),
    earned: num(d.earned),
    upcomingTours: int(d.upcoming_tours),
    expected: num(d.expected),
    unpricedTours: int(d.unpriced_tours),
    tours: list(d.tours).map((t) => ({
      id: str(t.id),
      reference: str(t.reference),
      date: str(t.date),
      title: str(t.title) || "Tour",
      pax: int(t.pax),
      status: str(t.status),
      fee: t.fee === null || t.fee === undefined ? null : num(t.fee),
    })),
  };
}

export type MoneyTotals = { bookings: number; booked: number; pickupFees: number; collected: number; refunded: number; guideFees: number; net: number };
export type OperatorMoney = MoneyTotals & { id: string; name: string };
export type GuideMoney = { id: string; name: string; completedTours: number; earned: number; expected: number };
export type MoneyEarnings = { totals: MoneyTotals; operators: OperatorMoney[]; guides: GuideMoney[] };

const totals = (t: Record<string, unknown>): MoneyTotals => ({
  bookings: int(t.bookings),
  booked: num(t.booked),
  pickupFees: num(t.pickup_fees),
  collected: num(t.collected),
  refunded: num(t.refunded),
  guideFees: num(t.guide_fees),
  net: num(t.net),
});

export function parseMoneyEarnings(data: unknown): MoneyEarnings {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    totals: totals((d.totals ?? {}) as Record<string, unknown>),
    operators: list(d.operators).map((o) => ({ ...totals(o), id: str(o.id), name: str(o.name) || "Operator" })),
    guides: list(d.guides).map((g) => ({ id: str(g.id), name: str(g.name) || "Guide", completedTours: int(g.completed_tours), earned: num(g.earned), expected: num(g.expected) })),
  };
}

/** A guide's revenue tracking (tours_guide_revenue): paid and owed, per operator and per month. */
export type GuideRevenue = {
  earned: number;
  paid: number;
  owed: number;
  paidIds: Set<string>;
  operators: { id: string; name: string; sharePct: number | null; tours: number; earned: number; owed: number }[];
  months: { month: string; tours: number; earned: number }[];
};

export function parseGuideRevenue(data: unknown): GuideRevenue {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    earned: num(d.earned),
    paid: num(d.paid),
    owed: num(d.owed),
    paidIds: new Set((Array.isArray(d.paid_ids) ? d.paid_ids : []).filter((x): x is string => typeof x === "string")),
    operators: list(d.operators)
      .map((o) => ({
        id: str(o.id),
        name: str(o.name) || "Tour operator",
        sharePct: o.share_pct === null || o.share_pct === undefined ? null : num(o.share_pct),
        tours: int(o.tours),
        earned: num(o.earned),
        owed: num(o.owed),
      }))
      .sort((a, b) => b.earned - a.earned),
    months: list(d.months)
      .map((m) => ({ month: str(m.month), tours: int(m.tours), earned: num(m.earned) }))
      .filter((m) => /^\d{4}-\d{2}$/.test(m.month))
      .sort((a, b) => a.month.localeCompare(b.month)),
  };
}

/** "Nov 2026" for "2026-11". */
export function monthLabel(key: string): string {
  return new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Completed tours whose guide fee the operator hasn't paid yet, and those paid. */
export type GuideFeeRow = { id: string; reference: string; date: string; title: string; guide: string; fee: number; paidAt: string | null };
