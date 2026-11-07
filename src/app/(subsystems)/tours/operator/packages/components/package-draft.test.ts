import { draftChecklist, formatDuration, missingChecklistItems } from "./package-draft";
import { createEmptyDraft } from "../create/draft-validation";
import type { EditPackageFormData } from "../[id]/edit/edit-types";

describe("formatDuration", () => {
  it("reads in plain words, singular and plural", () => {
    expect(formatDuration(1, "days")).toBe("1 day");
    expect(formatDuration(3, "days")).toBe("3 days");
    expect(formatDuration(1, "hours")).toBe("1 hour");
    expect(formatDuration(4, "hours")).toBe("4 hours");
    expect(formatDuration(2.5, "days")).toBe("2.5 days");
  });
});

describe("draftChecklist", () => {
  it("lists what a new package still needs", () => {
    const missing = missingChecklistItems(createEmptyDraft()).map((item) => item.id);
    expect(missing).toEqual(["cover", "price", "inclusions", "stops"]);
  });

  it("ticks items off as the operator fills them in", () => {
    const draft: EditPackageFormData = {
      ...createEmptyDraft(),
      coverImageUrl: "https://example.test/cover.jpg",
      priceVariants: [
        { variantName: "Standard", minPax: 1, maxPax: 8, pricePerPax: 950, flatPrice: null, isDefault: true },
      ],
      inclusions: [{ text: "Board", isIncluded: true, displayOrder: 1 }],
      stops: [
        {
          locationName: "Bagasbas Beach",
          description: null,
          latitude: 14.1122,
          longitude: 122.9553,
          estimatedDurationMinutes: null,
          stopOrder: 1,
        },
      ],
    };

    expect(draftChecklist(draft).every((item) => item.done)).toBe(true);
    expect(missingChecklistItems(draft)).toEqual([]);
  });

  it("does not count an exclusion as something included", () => {
    const draft: EditPackageFormData = {
      ...createEmptyDraft(),
      inclusions: [{ text: "Travel insurance", isIncluded: false, displayOrder: 1 }],
    };

    expect(missingChecklistItems(draft).map((item) => item.id)).toContain("inclusions");
  });

  it("points each missing item at the step that fixes it", () => {
    expect(draftChecklist(createEmptyDraft()).map((item) => item.section)).toEqual([
      "photos",
      "prices",
      "included",
      "stops",
    ]);
  });
});
