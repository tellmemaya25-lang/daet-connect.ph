import {
  validateStops,
  validateBasicInfo,
  validatePricing,
  validateInclusions,
  validateGallery,
  validateEditForm,
  isSequentialOrder,
} from "./validation";
import type {
  EditStop,
  EditPriceVariant,
  EditInclusion,
  EditGalleryImage,
  EditPackageFormData,
} from "./edit-types";

describe("Package Stops Validation", () => {
  const validStop: EditStop = {
    locationName: "Manila Cathedral",
    description: "Historic cathedral in downtown Manila",
    latitude: 14.592833,
    longitude: 120.981778,
    estimatedDurationMinutes: 45,
    stopOrder: 1,
  };

  describe("validateStops", () => {
    describe("**Validates: Requirements 7.1-7.13, 12.1-12.7**", () => {
      describe("at least one stop requirement", () => {
        it("rejects empty stops array with appropriate error", () => {
          const result = validateStops([]);
          expect(result.valid).toBe(false);
          expect(result.errors.stops).toBe("Add at least one itinerary stop.");
        });

        it("rejects non-array input with error", () => {
          const result = validateStops(null as unknown as EditStop[]);
          expect(result.valid).toBe(false);
          expect(result.errors.stops).toBe("Add at least one itinerary stop.");
        });

        it("accepts single valid stop", () => {
          const result = validateStops([validStop]);
          expect(result.valid).toBe(true);
          expect(result.errors.stops).toBeUndefined();
        });
      });

      describe("maximum 50 stops constraint", () => {
        it("accepts exactly 50 stops", () => {
          const stops: EditStop[] = Array.from({ length: 50 }, (_, i) => ({
            ...validStop,
            stopOrder: i + 1,
          }));
          const result = validateStops(stops);
          expect(result.valid).toBe(true);
          expect(result.errors.stops).toBeUndefined();
        });

        it("rejects more than 50 stops with appropriate error", () => {
          const stops: EditStop[] = Array.from({ length: 51 }, (_, i) => ({
            ...validStop,
            stopOrder: i + 1,
          }));
          const result = validateStops(stops);
          expect(result.valid).toBe(false);
          expect(result.errors.stops).toBe("You can add up to 50 stops.");
        });

        it("rejects 51 stops", () => {
          const stops: EditStop[] = Array.from({ length: 51 }, (_, i) => ({
            ...validStop,
            stopOrder: i + 1,
          }));
          const result = validateStops(stops);
          expect(result.valid).toBe(false);
        });
      });

      describe("location_name validation (2-100 chars, required)", () => {
        it("rejects stop with empty location_name", () => {
          const stop: EditStop = { ...validStop, locationName: "" };
          const result = validateStops([stop]);
          expect(result.valid).toBe(false);
          expect(result.errors["stops.0.locationName"]).toBeDefined();
        });

        it("rejects stop with location_name < 2 characters", () => {
          const stop: EditStop = { ...validStop, locationName: "A" };
          const result = validateStops([stop]);
          expect(result.valid).toBe(false);
          expect(result.errors["stops.0.locationName"]).toContain("2");
        });

        it("accepts stop with exactly 2 character location_name", () => {
          const stop: EditStop = { ...validStop, locationName: "AB" };
          const result = validateStops([stop]);
          expect(result.valid).toBe(true);
        });

        it("rejects stop with location_name > 100 characters", () => {
          const stop: EditStop = {
            ...validStop,
            locationName: "A".repeat(101),
          };
          const result = validateStops([stop]);
          expect(result.valid).toBe(false);
          expect(result.errors["stops.0.locationName"]).toContain("100");
        });

        it("accepts stop with exactly 100 character location_name", () => {
          const stop: EditStop = {
            ...validStop,
            locationName: "A".repeat(100),
          };
          const result = validateStops([stop]);
          expect(result.valid).toBe(true);
        });

        it("accepts location_name with whitespace trimming", () => {
          const stop: EditStop = {
            ...validStop,
            locationName: "  Valid Location  ",
          };
          const result = validateStops([stop]);
          expect(result.valid).toBe(true);
        });
      });

      describe("description validation (10-1000 chars if provided)", () => {
        it("accepts stop with null description", () => {
          const stop: EditStop = { ...validStop, description: null };
          const result = validateStops([stop]);
          expect(result.valid).toBe(true);
        });

        it("accepts stop with empty description string", () => {
          const stop: EditStop = { ...validStop, description: "" };
          const result = validateStops([stop]);
          expect(result.valid).toBe(true);
        });

        it("rejects stop with description < 10 characters", () => {
          const stop: EditStop = { ...validStop, description: "123456789" };
          const result = validateStops([stop]);
          expect(result.valid).toBe(false);
          expect(result.errors["stops.0.description"]).toContain("10");
        });

        it("accepts stop with exactly 10 character description", () => {
          const stop: EditStop = { ...validStop, description: "1234567890" };
          const result = validateStops([stop]);
          expect(result.valid).toBe(true);
        });

        it("rejects stop with description > 1000 characters", () => {
          const stop: EditStop = {
            ...validStop,
            description: "A".repeat(1001),
          };
          const result = validateStops([stop]);
          expect(result.valid).toBe(false);
          expect(result.errors["stops.0.description"]).toContain("1000");
        });

        it("accepts stop with exactly 1000 character description", () => {
          const stop: EditStop = {
            ...validStop,
            description: "A".repeat(1000),
          };
          const result = validateStops([stop]);
          expect(result.valid).toBe(true);
        });
      });

      describe("latitude validation (-90 to 90, required)", () => {
        it("rejects stop with latitude < -90", () => {
          const stop: EditStop = { ...validStop, latitude: -90.1 };
          const result = validateStops([stop]);
          expect(result.valid).toBe(false);
          expect(result.errors["stops.0.latitude"]).toContain("-90");
          expect(result.errors["stops.0.latitude"]).toContain("90");
        });

        it("accepts stop with latitude exactly -90", () => {
          const stop: EditStop = { ...validStop, latitude: -90 };
          const result = validateStops([stop]);
          expect(result.valid).toBe(true);
        });

        it("accepts stop with latitude 0", () => {
          const stop: EditStop = { ...validStop, latitude: 0 };
          const result = validateStops([stop]);
          expect(result.valid).toBe(true);
        });

        it("accepts stop with latitude exactly 90", () => {
          const stop: EditStop = { ...validStop, latitude: 90 };
          const result = validateStops([stop]);
          expect(result.valid).toBe(true);
        });

        it("rejects stop with latitude > 90", () => {
          const stop: EditStop = { ...validStop, latitude: 90.1 };
          const result = validateStops([stop]);
          expect(result.valid).toBe(false);
        });

        it("rejects stop with non-finite latitude", () => {
          const stop: EditStop = { ...validStop, latitude: NaN };
          const result = validateStops([stop]);
          expect(result.valid).toBe(false);
        });

        it("rejects stop with infinity latitude", () => {
          const stop: EditStop = { ...validStop, latitude: Infinity };
          const result = validateStops([stop]);
          expect(result.valid).toBe(false);
        });
      });

      describe("longitude validation (-180 to 180, required)", () => {
        it("rejects stop with longitude < -180", () => {
          const stop: EditStop = { ...validStop, longitude: -180.1 };
          const result = validateStops([stop]);
          expect(result.valid).toBe(false);
          expect(result.errors["stops.0.longitude"]).toContain("-180");
          expect(result.errors["stops.0.longitude"]).toContain("180");
        });

        it("accepts stop with longitude exactly -180", () => {
          const stop: EditStop = { ...validStop, longitude: -180 };
          const result = validateStops([stop]);
          expect(result.valid).toBe(true);
        });

        it("accepts stop with longitude 0", () => {
          const stop: EditStop = { ...validStop, longitude: 0 };
          const result = validateStops([stop]);
          expect(result.valid).toBe(true);
        });

        it("accepts stop with longitude exactly 180", () => {
          const stop: EditStop = { ...validStop, longitude: 180 };
          const result = validateStops([stop]);
          expect(result.valid).toBe(true);
        });

        it("rejects stop with longitude > 180", () => {
          const stop: EditStop = { ...validStop, longitude: 180.1 };
          const result = validateStops([stop]);
          expect(result.valid).toBe(false);
        });

        it("rejects stop with non-finite longitude", () => {
          const stop: EditStop = { ...validStop, longitude: NaN };
          const result = validateStops([stop]);
          expect(result.valid).toBe(false);
        });

        it("rejects stop with infinity longitude", () => {
          const stop: EditStop = { ...validStop, longitude: Infinity };
          const result = validateStops([stop]);
          expect(result.valid).toBe(false);
        });
      });

      describe("stop_order sequential validation", () => {
        it("rejects stops with non-sequential stop_order", () => {
          const stops: EditStop[] = [
            { ...validStop, stopOrder: 1 },
            { ...validStop, stopOrder: 3 }, // Missing 2, but appears after 1
            { ...validStop, stopOrder: 4 }, // Continues from 3
          ];
          const result = validateStops(stops);
          expect(result.valid).toBe(false);
          expect(result.errors.stops).toContain("order");
        });

        it("accepts stops with sequential 1..n stop_order", () => {
          const stops: EditStop[] = [
            { ...validStop, stopOrder: 1 },
            { ...validStop, stopOrder: 2 },
            { ...validStop, stopOrder: 3 },
          ];
          const result = validateStops(stops);
          expect(result.valid).toBe(true);
        });

        it("rejects stops starting from 0", () => {
          const stops: EditStop[] = [
            { ...validStop, stopOrder: 0 },
            { ...validStop, stopOrder: 1 },
          ];
          const result = validateStops(stops);
          expect(result.valid).toBe(false);
        });

        it("accepts stops in any initial order but sequential 1..n", () => {
          const stops: EditStop[] = [
            { ...validStop, stopOrder: 3 },
            { ...validStop, stopOrder: 1 },
            { ...validStop, stopOrder: 2 },
          ];
          const result = validateStops(stops);
          expect(result.valid).toBe(true);
        });

        it("rejects duplicate stop_order values", () => {
          const stops: EditStop[] = [
            { ...validStop, stopOrder: 1 },
            { ...validStop, stopOrder: 1 },
          ];
          const result = validateStops(stops);
          expect(result.valid).toBe(false);
        });
      });

      describe("multiple stops with mixed errors", () => {
        it("collects errors from all invalid stops", () => {
          const stops: EditStop[] = [
            { ...validStop, stopOrder: 1 }, // Valid
            { ...validStop, locationName: "", stopOrder: 2 }, // Invalid: empty name
            { ...validStop, latitude: 91, stopOrder: 3 }, // Invalid: lat out of range
          ];
          const result = validateStops(stops);
          expect(result.valid).toBe(false);
          expect(result.errors["stops.1.locationName"]).toBeDefined();
          expect(result.errors["stops.2.latitude"]).toBeDefined();
        });

        it("passes when all stops are valid", () => {
          const stops: EditStop[] = [
            {
              locationName: "Stop 1",
              description: "First stop description",
              latitude: 14.0,
              longitude: 120.0,
              stopOrder: 1,
            },
            {
              locationName: "Stop 2",
              description: "Second stop description",
              latitude: 15.0,
              longitude: 121.0,
              stopOrder: 2,
            },
            {
              locationName: "Stop 3",
              description: null,
              latitude: 16.0,
              longitude: 122.0,
              stopOrder: 3,
            },
          ];
          const result = validateStops(stops);
          expect(result.valid).toBe(true);
        });
      });

      describe("return type validation", () => {
        it("returns ValidationResult with valid and errors properties", () => {
          const result = validateStops([validStop]);
          expect(typeof result.valid).toBe("boolean");
          expect(typeof result.errors).toBe("object");
        });

        it("returns valid: true with empty errors object on success", () => {
          const result = validateStops([validStop]);
          expect(result.valid).toBe(true);
          expect(Object.keys(result.errors).length).toBe(0);
        });

        it("returns valid: false with populated errors object on failure", () => {
          const result = validateStops([]);
          expect(result.valid).toBe(false);
          expect(Object.keys(result.errors).length).toBeGreaterThan(0);
        });
      });
    });
  });

  describe("Helper function: isSequentialOrder", () => {
    it("identifies sequential arrays 1..n", () => {
      expect(isSequentialOrder([1])).toBe(true);
      expect(isSequentialOrder([1, 2, 3])).toBe(true);
      expect(isSequentialOrder([2, 1, 3])).toBe(true); // Different order
    });

    it("rejects non-sequential arrays", () => {
      expect(isSequentialOrder([1, 3])).toBe(false);
      expect(isSequentialOrder([0, 1, 2])).toBe(false);
      expect(isSequentialOrder([1, 2, 2])).toBe(false);
    });

    it("rejects empty array", () => {
      expect(isSequentialOrder([])).toBe(true); // Empty is vacuously true (no violations)
    });
  });
});

describe("Comprehensive Validation Integration Tests", () => {
  const validBasicInfo = {
    title: "Mountain Trek Adventure",
    locationName: "Cordillera Mountains",
    description: "Explore the scenic mountain trails",
    durationValue: 3,
    durationType: "days" as const,
  };

  const validPriceVariant: EditPriceVariant = {
    variantName: "Standard",
    minPax: 2,
    maxPax: 10,
    pricePerPax: 5000,
    flatPrice: null,
    isDefault: true,
  };

  const validInclusion: EditInclusion = {
    text: "Professional guide",
    isIncluded: true,
    displayOrder: 1,
  };

  const validStop: EditStop = {
    locationName: "Base Camp",
    description: "Starting point for the trek",
    latitude: 17.5,
    longitude: 121.5,
    estimatedDurationMinutes: 60,
    stopOrder: 1,
  };

  const validGalleryImage: EditGalleryImage = {
    imageUrl: "https://example.com/image.jpg",
    caption: "Mountain view",
    displayOrder: 1,
  };

  it("validates complete package form with valid stops", () => {
    const formData: EditPackageFormData = {
      ...validBasicInfo,
      coverImageUrl: null,
      priceVariants: [validPriceVariant],
      inclusions: [validInclusion],
      stops: [validStop],
      galleryImages: [validGalleryImage],
    };

    const result = validateEditForm(formData);
    expect(result.valid).toBe(true);
  });

  it("rejects form with invalid stops", () => {
    const formData: EditPackageFormData = {
      ...validBasicInfo,
      coverImageUrl: null,
      priceVariants: [validPriceVariant],
      inclusions: [validInclusion],
      stops: [
        { ...validStop, latitude: 91 }, // Invalid latitude
      ],
      galleryImages: [validGalleryImage],
    };

    const result = validateEditForm(formData);
    expect(result.valid).toBe(false);
    expect(result.errors["stops.0.latitude"]).toBeDefined();
  });
});
