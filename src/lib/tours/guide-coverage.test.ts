import { packagesWithoutGuides, parseCoverage, uncoveredAreas } from "./guide-coverage";

describe("parseCoverage", () => {
  it("reads areas, guides and waiting bookings, dropping unknown towns", () => {
    const c = parseCoverage({
      areas: [
        { municipality: "Daet", guides: 2, packages: 3 },
        { municipality: "Naga", guides: 1, packages: 0 },
      ],
      unplaced_packages: 4,
      guides: [{ id: "g1", name: "Ana", areas: ["Daet", "Mars"] }],
      bookings: [{ id: "b1", booking_reference: "BK-1", tour_date: "2026-12-01", status: "pending", number_of_pax: 2, title: "Falls", operator_name: "Kalmado", municipality: "Daet", guide_proposal_status: "proposed", guide_proposed_by: "auto", proposed_guide_id: "g1", proposed_guide_name: "Ana" }],
    });
    expect(c.areas).toEqual([{ municipality: "Daet", guides: 2, packages: 3 }]);
    expect(c.guides[0].areas).toEqual(["Daet"]);
    expect(c.bookings[0]).toMatchObject({ reference: "BK-1", proposal: "proposed", proposedBy: "auto", proposedGuideName: "Ana" });
    expect(c.unplacedPackages).toBe(4);
  });
});

describe("uncoveredAreas", () => {
  it("lists towns with tours and no guide", () => {
    expect(
      uncoveredAreas([
        { municipality: "Daet", guides: 0, packages: 2 },
        { municipality: "Labo", guides: 0, packages: 0 },
        { municipality: "Basud", guides: 1, packages: 1 },
      ]).map((a) => a.municipality),
    ).toEqual(["Daet"]);
  });
});

describe("packages", () => {
  it("reads each package's own guides", () => {
    const c = parseCoverage({ packages: [{ id: "p1", title: "Surf", operator: "Kalmado", municipality: "Daet", guide_ids: ["g1", 7] }] });
    expect(c.packages).toEqual([{ id: "p1", title: "Surf", operator: "Kalmado", municipality: "Daet", guideIds: ["g1"] }]);
  });
  it("flags packages that can get no guide", () => {
    expect(
      packagesWithoutGuides([
        { id: "a", title: "A", operator: "O", municipality: null, guideIds: [] },
        { id: "b", title: "B", operator: "O", municipality: "Daet", guideIds: [] },
        { id: "c", title: "C", operator: "O", municipality: null, guideIds: ["g1"] },
      ]).map((p) => p.id),
    ).toEqual(["a"]);
  });
});
