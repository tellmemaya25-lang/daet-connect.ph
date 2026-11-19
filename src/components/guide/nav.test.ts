import { guideAreaFor, GUIDE_GROUPS } from "./nav";

describe("guideAreaFor", () => {
  it("matches an area and its sub-pages", () => {
    expect(guideAreaFor("/tours/guide/my-tours")?.label).toBe("My tours");
    expect(guideAreaFor("/tours/guide/earnings")?.label).toBe("Earnings");
  });
  it("has no area for the application pages", () => {
    expect(guideAreaFor("/tours/guide/pending")).toBeUndefined();
    expect(guideAreaFor("/tours/guide/register")).toBeUndefined();
  });
  it("lists each destination once", () => {
    const hrefs = GUIDE_GROUPS.flatMap((g) => g.areas.map((a) => a.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
