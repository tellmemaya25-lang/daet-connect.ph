import { areaFor } from "../nav";

describe("areaFor", () => {
  it("matches the dashboard only on its own path", () => {
    expect(areaFor("/tours/admin")?.label).toBe("Dashboard");
    expect(areaFor("/tours/admin/fares")?.label).toBe("Fares");
  });
  it("matches nested pages to their area", () => {
    expect(areaFor("/tours/admin/fares/abc/edit")?.label).toBe("Fares");
    expect(areaFor("/tours/admin/guide-places/new")?.label).toBe("Food and stays");
  });
  it("does not confuse areas that share a prefix", () => {
    expect(areaFor("/tours/admin/guides")?.label).toBe("Guides");
    expect(areaFor("/tours/admin/guide-places")?.label).toBe("Food and stays");
  });
  it("returns nothing for unknown paths", () => {
    expect(areaFor("/tours/admin/unknown")).toBeUndefined();
  });
});

describe("areaFor with newer areas", () => {
  it("keeps guide assignments apart from guides", () => {
    expect(areaFor("/tours/admin/guide-assignments")?.label).toBe("Guide assignments");
  });
});
