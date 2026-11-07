import {
  createEmptyDraft,
  errorsForStep,
  firstStepWithErrors,
  stepForErrorKey,
  stepIndexOf,
  TOTAL_STEPS,
  validateDraft,
  WIZARD_STEPS,
} from "./draft-validation";
import type { EditPackageFormData } from "../[id]/edit/edit-types";

function basicsOnly(): EditPackageFormData {
  return {
    ...createEmptyDraft(),
    title: "Bagasbas surf lesson",
    locationName: "Bagasbas Beach, Daet",
  };
}

describe("wizard steps", () => {
  it("runs Basics, Photos, Prices, What's included, Route & stops — five in all", () => {
    expect(WIZARD_STEPS.map((step) => step.id)).toEqual(["basics", "photos", "prices", "included", "stops"]);
    expect(WIZARD_STEPS.map((step) => step.label)).toEqual([
      "Basics",
      "Photos",
      "Prices",
      "What's included",
      "Route & stops",
    ]);
    expect(TOTAL_STEPS).toBe(5);
  });

  it("finds the step a field belongs to", () => {
    expect(stepForErrorKey("title")).toBe("basics");
    expect(stepForErrorKey("durationType")).toBe("basics");
    expect(stepForErrorKey("galleryImages.2.caption")).toBe("photos");
    expect(stepForErrorKey("coverImageUrl")).toBe("photos");
    expect(stepForErrorKey("priceVariants.0.minPax")).toBe("prices");
    expect(stepForErrorKey("inclusions.0.text")).toBe("included");
    expect(stepForErrorKey("stops.1.locationName")).toBe("stops");
    expect(stepForErrorKey("somethingUnknown")).toBeNull();
    expect(stepIndexOf("stops")).toBe(4);
  });

  it("points at the earliest step with a problem", () => {
    expect(firstStepWithErrors({})).toBeNull();
    expect(firstStepWithErrors({ stops: "Add at least one stop." })).toBe("stops");
    expect(
      firstStepWithErrors({ "priceVariants.0.price": "Set a price.", title: "Title is required." }),
    ).toBe("basics");
  });

  it("scopes errors to one step", () => {
    const errors = { title: "Title is required.", "stops.0.locationName": "Too short." };
    expect(errorsForStep(errors, "basics")).toEqual({ title: "Title is required." });
    expect(errorsForStep(errors, "stops")).toEqual({ "stops.0.locationName": "Too short." });
    expect(errorsForStep(errors, "prices")).toEqual({});
  });
});

describe("validateDraft", () => {
  it("lets a draft be saved with only the basics filled in", () => {
    expect(validateDraft(basicsOnly(), { requireComplete: false })).toEqual({});
  });

  it("still checks the basics on a draft save", () => {
    const errors = validateDraft(createEmptyDraft(), { requireComplete: false });
    expect(errors.title).toBe("Title is required.");
    expect(errors.locationName).toBe("Location is required.");
  });

  it("checks values that are present, even on a draft", () => {
    const draft: EditPackageFormData = {
      ...basicsOnly(),
      priceVariants: [
        { variantName: "Standard", minPax: 1, maxPax: 4, pricePerPax: -5, flatPrice: null, isDefault: true },
      ],
      stops: [
        {
          locationName: "B",
          description: null,
          latitude: 14.1,
          longitude: 122.9,
          estimatedDurationMinutes: null,
          stopOrder: 1,
        },
      ],
    };

    const errors = validateDraft(draft, { requireComplete: false });

    expect(errors["priceVariants.0.pricePerPax"]).toBeTruthy();
    expect(errors["stops.0.locationName"]).toBeTruthy();
    // A draft may have no inclusions at all.
    expect(errors.inclusions).toBeUndefined();
    expect(errors.stops).toBeUndefined();
  });

  it("applies the full editor rules before submitting for review", () => {
    const errors = validateDraft(basicsOnly(), { requireComplete: true });

    expect(errors.priceVariants).toBe("Add at least one price variant.");
    expect(errors.inclusions).toBe("Add at least one included item.");
    expect(errors.stops).toBe("Add at least one itinerary stop.");
  });

  it("accepts a complete package", () => {
    const draft: EditPackageFormData = {
      ...basicsOnly(),
      priceVariants: [
        { variantName: "Standard", minPax: 1, maxPax: 8, pricePerPax: 950, flatPrice: null, isDefault: true },
      ],
      inclusions: [{ text: "Board and rash guard", isIncluded: true, displayOrder: 1 }],
      stops: [
        {
          locationName: "Bagasbas Beach",
          description: "Meet at the lifeguard station.",
          latitude: 14.1122,
          longitude: 122.9553,
          estimatedDurationMinutes: 120,
          stopOrder: 1,
        },
      ],
    };

    expect(validateDraft(draft, { requireComplete: true })).toEqual({});
  });

  it("requires exactly one default price option", () => {
    const draft: EditPackageFormData = {
      ...basicsOnly(),
      priceVariants: [
        { variantName: "Standard", minPax: 1, maxPax: 8, pricePerPax: 950, flatPrice: null, isDefault: false },
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

    expect(validateDraft(draft, { requireComplete: true }).priceVariants).toMatch(/exactly one/i);
  });
});
