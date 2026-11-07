import { parseDraftPayload } from "./draft-payload";
import { createEmptyDraft } from "./draft-validation";

describe("parseDraftPayload", () => {
  it("rebuilds a draft field by field", () => {
    const parsed = parseDraftPayload({
      ...createEmptyDraft(),
      title: "  Bagasbas surf lesson  ",
      locationName: "Bagasbas Beach, Daet",
      description: "  ",
      durationValue: "3",
      durationType: "hours",
      priceVariants: [
        { variantName: "Standard", minPax: 1, maxPax: null, pricePerPax: 950, flatPrice: null, isDefault: true },
      ],
      inclusions: [{ text: "Board", isIncluded: true, displayOrder: 1, package_id: "someone-elses" }],
      stops: [
        {
          locationName: "Bagasbas Beach",
          latitude: 14.1122,
          longitude: 122.9553,
          stopOrder: 1,
        },
      ],
      galleryImages: [{ imageUrl: "https://example.test/a.jpg", displayOrder: 1 }],
      // A client cannot smuggle extra columns in.
      operator_id: "another-operator",
      status: "published",
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.draft.title).toBe("Bagasbas surf lesson");
    expect(parsed.draft.description).toBeNull();
    expect(parsed.draft.durationValue).toBe(3);
    expect(parsed.draft.inclusions[0]).toEqual({ id: undefined, text: "Board", isIncluded: true, displayOrder: 1 });
    expect(parsed.draft.stops[0]).toMatchObject({ latitude: 14.1122, longitude: 122.9553, stopOrder: 1 });
    expect(parsed.draft.galleryImages[0]).toMatchObject({ imageUrl: "https://example.test/a.jpg", displayOrder: 1 });
    expect(parsed.draft).not.toHaveProperty("operator_id");
    expect(parsed.draft).not.toHaveProperty("status");
  });

  it("refuses input that is not an object", () => {
    expect(parseDraftPayload(null)).toEqual({
      ok: false,
      error: expect.stringMatching(/could not be read/i),
    });
    expect(parseDraftPayload("nope").ok).toBe(false);
  });

  it("refuses an unknown duration unit", () => {
    const parsed = parseDraftPayload({ ...createEmptyDraft(), durationType: "weeks" });
    expect(parsed).toEqual({ ok: false, error: expect.stringMatching(/hours or days/i) });
  });

  it("refuses a missing duration", () => {
    const parsed = parseDraftPayload({ ...createEmptyDraft(), durationValue: null });
    expect(parsed.ok).toBe(false);
  });

  it("refuses two default price options", () => {
    const parsed = parseDraftPayload({
      ...createEmptyDraft(),
      priceVariants: [
        { variantName: "A", minPax: 1, pricePerPax: 100, isDefault: true },
        { variantName: "B", minPax: 1, pricePerPax: 200, isDefault: true },
      ],
    });

    expect(parsed).toEqual({ ok: false, error: expect.stringMatching(/only one price option/i) });
  });

  it("drops gallery rows without an image", () => {
    const parsed = parseDraftPayload({
      ...createEmptyDraft(),
      galleryImages: [{ imageUrl: "  " }, { imageUrl: "https://example.test/b.jpg" }],
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.draft.galleryImages).toHaveLength(1);
    expect(parsed.draft.galleryImages[0].imageUrl).toBe("https://example.test/b.jpg");
  });

  it("caps lists so an oversized payload cannot reach the database", () => {
    const parsed = parseDraftPayload({
      ...createEmptyDraft(),
      inclusions: Array.from({ length: 200 }, (_, index) => ({ text: `Item ${index}`, isIncluded: true })),
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.draft.inclusions.length).toBeLessThanOrEqual(50);
  });

  it("caps text so one field cannot be a megabyte", () => {
    const parsed = parseDraftPayload({ ...createEmptyDraft(), title: "x".repeat(500) });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.draft.title.length).toBe(150);
  });
});
