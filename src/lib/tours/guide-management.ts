/**
 * The operator's guide management (owner's request): each team guide's
 * availability, load, pay and the revenue of the tours they led, who is doing
 * best, who isn't getting enough tours, and which guides fit a package.
 * Data from tours_operator_guide_stats() (20261208_guide_management.sql).
 */

export type GuideStat = {
  id: string;
  name: string;
  /** Agreed share of the tour price; null while on the package's fixed fee. */
  sharePct: number | null;
  /** Days in the next 30 the guide marked available and has no tour. */
  freeDays: number;
  /** Their pending or confirmed tours with this operator from today on. */
  upcoming: number;
  /** Tours with this operator assigned to them in the last 30 days (the pick's load measure). */
  recentTours: number;
  /** Completed tours with this operator in the chosen range. */
  completed: number;
  /** Their fees on those tours (what the operator pays them). */
  earned: number;
  /** The booking totals of those tours. */
  revenue: number;
  rating: number | null;
  reviews: number;
  listedPackageIds: string[];
  ledPackageIds: string[];
};

export type PackageGuides = { id: string; title: string; guideIds: string[] };
export type GuideStats = { autoAssign: boolean; guides: GuideStat[]; packages: PackageGuides[] };

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const ids = (v: unknown) => (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string");
const rows = (v: unknown) => (Array.isArray(v) ? v : []).filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object");

export function parseGuideStats(data: unknown): GuideStats {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    autoAssign: d.auto_assign === true,
    guides: rows(d.guides)
      .filter((g) => typeof g.id === "string")
      .map((g) => ({
        id: g.id as string,
        name: typeof g.name === "string" && g.name.trim() ? g.name : "Guide",
        sharePct: g.share_pct === null || g.share_pct === undefined ? null : num(g.share_pct) || null,
        freeDays: num(g.free_days_30),
        upcoming: num(g.upcoming),
        recentTours: num(g.tours_30),
        completed: num(g.completed),
        earned: Math.round(num(g.earned) * 100) / 100,
        revenue: Math.round(num(g.revenue) * 100) / 100,
        rating: g.rating === null || g.rating === undefined ? null : num(g.rating),
        reviews: num(g.reviews),
        listedPackageIds: ids(g.listed_package_ids),
        ledPackageIds: ids(g.led_package_ids),
      })),
    packages: rows(d.packages)
      .filter((p) => typeof p.id === "string")
      .map((p) => ({ id: p.id as string, title: typeof p.title === "string" ? p.title : "Tour", guideIds: ids(p.guide_ids) })),
  };
}

/** Most completed tours in the range, then revenue, then rating; only guides who completed one. */
export function topGuides(guides: GuideStat[], count = 3): GuideStat[] {
  return guides
    .filter((g) => g.completed > 0)
    .sort((a, b) => b.completed - a.completed || b.revenue - a.revenue || (b.rating ?? 0) - (a.rating ?? 0) || a.name.localeCompare(b.name))
    .slice(0, count);
}

/**
 * Guides who are free but getting fewer than half the team's average recent
 * tours: the ones automatic assignment favours next. None when no one has
 * had a tour yet.
 */
export function underAssigned(guides: GuideStat[]): GuideStat[] {
  if (!guides.length) return [];
  const average = guides.reduce((sum, g) => sum + g.recentTours, 0) / guides.length;
  return guides.filter((g) => g.freeDays > 0 && g.recentTours < average / 2).sort((a, b) => a.recentTours - b.recentTours || b.freeDays - a.freeDays);
}

/** The team average of recent tours, for the "not getting enough" note. */
export function averageRecentTours(guides: GuideStat[]): number {
  return guides.length ? Math.round((guides.reduce((sum, g) => sum + g.recentTours, 0) / guides.length) * 10) / 10 : 0;
}

/** For one package: its ranked guides, and other team guides who have led it before. */
export function guidesForPackage(stats: GuideStats, packageId: string): { listed: GuideStat[]; ledBefore: GuideStat[]; others: GuideStat[] } {
  const pkg = stats.packages.find((p) => p.id === packageId);
  const byId = new Map(stats.guides.map((g) => [g.id, g]));
  const listed = (pkg?.guideIds ?? []).flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const listedIds = new Set(listed.map((g) => g.id));
  const ledBefore = stats.guides.filter((g) => !listedIds.has(g.id) && g.ledPackageIds.includes(packageId));
  const ledIds = new Set(ledBefore.map((g) => g.id));
  const others = stats.guides.filter((g) => !listedIds.has(g.id) && !ledIds.has(g.id));
  return { listed, ledBefore, others };
}

/** Moves one id up (-1) or down (+1) in a ranked list. */
export function moveInRanking(order: string[], id: string, step: -1 | 1): string[] {
  const from = order.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= order.length) return order;
  const next = [...order];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
