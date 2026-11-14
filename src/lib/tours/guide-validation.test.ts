import { guideFieldErrors, hasGuideIdConsent, validateGuideRegistration } from "@/lib/tours/guide-validation";

const validProfile = {
  fullName: "Maya Santos",
  contactPhone: "09171234567",
  bio: "I have guided visitors around Daet for several years.",
  idType: "philippine_national_id",
  idNumber: "1234-5678-9012",
};

describe("guide application validation", () => {
  it("accepts a valid profile", () => {
    expect(validateGuideRegistration(validProfile).success).toBe(true);
  });

  it("returns field-specific errors for invalid profile values", () => {
    const result = validateGuideRegistration({ ...validProfile, fullName: "", contactPhone: "phone", idNumber: "x" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(guideFieldErrors(result.error)).toEqual(expect.objectContaining({
        fullName: expect.any(String),
        contactPhone: expect.any(String),
        idNumber: expect.any(String),
      }));
    }
  });

  it("requires an explicit true consent value", () => {
    expect(hasGuideIdConsent(null)).toBe(false);
    expect(hasGuideIdConsent("on")).toBe(false);
    expect(hasGuideIdConsent("false")).toBe(false);
    expect(hasGuideIdConsent("true")).toBe(true);
  });
});
