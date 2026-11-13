import { digitsOnlyPhone, phoneError } from "./phone";

describe("digitsOnlyPhone", () => {
  it("drops letters, spaces and symbols", () => {
    expect(digitsOnlyPhone("09a12 3-45b6789")).toBe("09123456789");
    expect(digitsOnlyPhone("+63 912 345 6789")).toBe("639123456789");
  });
  it("caps the length", () => {
    expect(digitsOnlyPhone("1234567890123456")).toHaveLength(13);
  });
});

describe("phoneError", () => {
  it("accepts a PH mobile number", () => {
    expect(phoneError("09123456789")).toBeNull();
  });
  it("rejects letters", () => {
    expect(phoneError("0912345678a")).toMatch(/numbers only/);
  });
  it("rejects symbols", () => {
    expect(phoneError("+639123456789")).toMatch(/numbers only/);
  });
  it("rejects too short and too long", () => {
    expect(phoneError("091234")).toMatch(/10 to 13/);
    expect(phoneError("09123456789012")).toMatch(/10 to 13/);
  });
});
