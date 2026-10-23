import { safeNextPath } from "@/lib/safe-redirect";

describe("safeNextPath", () => {
  it("keeps same-site paths with query and hash", () => {
    expect(safeNextPath("/tours/me")).toBe("/tours/me");
    expect(safeNextPath("/tours/bookings/1?payment=success#payment")).toBe("/tours/bookings/1?payment=success#payment");
  });
  it("rejects other origins and junk", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil", "", "/\t/evil", null, 42]) {
      expect(safeNextPath(bad)).toBe("/");
    }
  });
});
