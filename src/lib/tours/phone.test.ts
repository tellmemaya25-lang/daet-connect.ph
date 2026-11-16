import { digitsOnlyPhone, phoneError } from "./phone";
import { validateGuideRegistration } from "./guide-validation";
import { validateOperatorDetails } from "./operator-validation";

describe("digitsOnlyPhone", () => {
  it("drops letters, spaces and symbols", () => {
    expect(digitsOnlyPhone("09a12 3-45b6789")).toBe("09123456789");
    expect(digitsOnlyPhone("0921353213fdgsdfgdsgdf")).toBe("0921353213");
  });
  it("caps the length at 11", () => {
    expect(digitsOnlyPhone("1234567890123456")).toHaveLength(11);
  });
});

describe("phoneError", () => {
  it("accepts exactly 11 digits", () => {
    expect(phoneError("09123456789")).toBeNull();
  });
  it("rejects letters", () => {
    expect(phoneError("0921353213fdgsdfgdsgdf")).toMatch(/numbers only/);
    expect(phoneError("0912345678a")).toMatch(/numbers only/);
  });
  it("rejects symbols and spaces", () => {
    expect(phoneError("+639123456789")).toMatch(/numbers only/);
    expect(phoneError("0912 345 6789")).toMatch(/numbers only/);
  });
  it("rejects anything other than 11 digits", () => {
    expect(phoneError("0912345678")).toMatch(/exactly 11/);
    expect(phoneError("091234567890")).toMatch(/exactly 11/);
  });
  it("rejects non-strings", () => {
    expect(phoneError(undefined)).toMatch(/numbers only/);
  });
});

describe("contact number on every role's server validation", () => {
  const guide = { fullName: "Ana Cruz", bio: "x".repeat(30), idType: "passport", idNumber: "P1234567" };
  const operator = {
    businessName: "Daet Tours",
    contactPerson: "Ana Cruz",
    contactEmail: "ana@example.com",
    businessAddress: "Brgy. Lag-on, Daet",
  };

  it.each(["0921353213fdgsdf", "0912345678", "+639123456789", "0912 345 6789"])("guide rejects %s", (contactPhone) => {
    expect(validateGuideRegistration({ ...guide, contactPhone }).success).toBe(false);
  });
  it("guide accepts 11 digits", () => {
    expect(validateGuideRegistration({ ...guide, contactPhone: "09123456789" }).success).toBe(true);
  });
  it.each(["0921353213fdgsdf", "0912345678", "+639123456789", "0912 345 6789"])("operator rejects %s", (contactPhone) => {
    expect(validateOperatorDetails({ ...operator, contactPhone }).success).toBe(false);
  });
  it("operator accepts 11 digits", () => {
    expect(validateOperatorDetails({ ...operator, contactPhone: "09123456789" }).success).toBe(true);
  });
});
