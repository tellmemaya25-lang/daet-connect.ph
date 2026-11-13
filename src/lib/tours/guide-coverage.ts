import { isMunicipality, type Municipality } from "./municipalities";

/**
 * The admin's guide-assignment board (owner's list, items 8 and 9), from
 * tours_admin_guide_coverage(): guides per municipality, each guide's service
 * areas, and upcoming bookings that still have no guide.
 */
export type AreaCoverage = { municipality: Municipality; guides: number; packages: number };
export type CoverageGuide = { id: string; name: string; areas: Municipality[] };
export type WaitingBooking = {
  id: string;
  reference: string;
  date: string;
  status: string;
  pax: number;
  title: string;
  operator: string;
  municipality: Municipality | null;
  proposal: "proposed" | "none_available" | null;
  proposedBy: "auto" | "admin" | null;
  proposedGuideId: string | null;
  proposedGuideName: string | null;
};
/** A published package and the guides chosen for it (tried first for its bookings). */
export type CoveragePackage = { id: string; title: string; operator: string; municipality: Municipality | null; guideIds: string[] };
export type Coverage = { areas: AreaCoverage[]; unplacedPackages: number; guides: CoverageGuide[]; packages: CoveragePackage[]; bookings: WaitingBooking[] };

const rows = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
const text = (v: unknown) => (typeof v === "string" ? v : "");

export function parseCoverage(data: unknown): Coverage {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    areas: rows(d.areas)
      .filter((a) => isMunicipality(a.municipality))
      .map((a) => ({ municipality: a.municipality as Municipality, guides: Number(a.guides) || 0, packages: Number(a.packages) || 0 })),
    unplacedPackages: Number(d.unplaced_packages) || 0,
    guides: rows(d.guides).map((g) => ({ id: text(g.id), name: text(g.name) || "Guide", areas: (Array.isArray(g.areas) ? g.areas : []).filter(isMunicipality) })),
    packages: rows(d.packages).map((p) => ({
      id: text(p.id),
      title: text(p.title) || "Tour",
      operator: text(p.operator) || "Operator",
      municipality: isMunicipality(p.municipality) ? p.municipality : null,
      guideIds: (Array.isArray(p.guide_ids) ? p.guide_ids : []).filter((id): id is string => typeof id === "string"),
    })),
    bookings: rows(d.bookings).map((b) => ({
      id: text(b.id),
      reference: text(b.booking_reference),
      date: text(b.tour_date),
      status: text(b.status),
      pax: Number(b.number_of_pax) || 0,
      title: text(b.title) || "Tour",
      operator: text(b.operator_name) || "Operator",
      municipality: isMunicipality(b.municipality) ? b.municipality : null,
      proposal: b.guide_proposal_status === "proposed" || b.guide_proposal_status === "none_available" ? b.guide_proposal_status : null,
      proposedBy: b.guide_proposed_by === "admin" || b.guide_proposed_by === "auto" ? b.guide_proposed_by : null,
      proposedGuideId: text(b.proposed_guide_id) || null,
      proposedGuideName: text(b.proposed_guide_name) || null,
    })),
  };
}

/** Municipalities with published tours but no guide serving them: the gaps to fill first. */
export function uncoveredAreas(areas: AreaCoverage[]): AreaCoverage[] {
  return areas.filter((a) => a.packages > 0 && a.guides === 0);
}

/** Published packages with no guide of their own and no municipality: no guide can be proposed for them. */
export function packagesWithoutGuides(packages: CoveragePackage[]): CoveragePackage[] {
  return packages.filter((p) => p.guideIds.length === 0 && p.municipality === null);
}
