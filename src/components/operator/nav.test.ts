import { operatorAreaFor, OPERATOR_GROUPS } from "./nav";

describe("operatorAreaFor", () => {
  it("matches an area and its sub-pages", () => {
    expect(operatorAreaFor("/tours/operator/packages")?.label).toBe("Packages");
    expect(operatorAreaFor("/tours/operator/packages/abc/edit")?.label).toBe("Packages");
    expect(operatorAreaFor("/tours/operator/live/xyz")?.label).toBe("Live");
  });
  it("has no area for the application pages", () => {
    expect(operatorAreaFor("/tours/operator/pending")).toBeUndefined();
    expect(operatorAreaFor("/tours/operator/register")).toBeUndefined();
  });
  it("lists each destination once", () => {
    const hrefs = OPERATOR_GROUPS.flatMap((g) => g.areas.map((a) => a.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
