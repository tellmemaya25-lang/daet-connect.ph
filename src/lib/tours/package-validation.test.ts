import { validatePackageFormData, ValidationResult } from "@/lib/tours/package-validation";

describe("validatePackageFormData", () => {
  describe("Property 7: Field Validation Framework", () => {
    describe("Validates: Requirements 3.1-3.8, 12.1-12.7", () => {
      describe("title field validation", () => {
        it("accepts valid title with exactly 3 characters", () => {
          const result = validatePackageFormData({
            title: "ABC",
            locationName: "Location",
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(true);
          expect(result.errors.title).toBeUndefined();
        });

        it("accepts valid title with exactly 150 characters", () => {
          const title = "A".repeat(150);
          const result = validatePackageFormData({
            title,
            locationName: "Location",
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(true);
          expect(result.errors.title).toBeUndefined();
        });

        it("accepts valid title with 50 characters", () => {
          const result = validatePackageFormData({
            title: "Beach Resort Tour with Water Activities",
            locationName: "Location",
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(true);
          expect(result.errors.title).toBeUndefined();
        });

        it("rejects title with fewer than 3 characters", () => {
          const result = validatePackageFormData({
            title: "AB",
            locationName: "Location",
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(false);
          expect(result.errors.title).toContain(
            "Title must be at least 3 characters"
          );
        });

        it("rejects title with more than 150 characters", () => {
          const title = "A".repeat(151);
          const result = validatePackageFormData({
            title,
            locationName: "Location",
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(false);
          expect(result.errors.title).toContain(
            "Title must be at most 150 characters"
          );
        });

        it("rejects empty title", () => {
          const result = validatePackageFormData({
            title: "",
            locationName: "Location",
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(false);
          expect(result.errors.title).toContain("Title is required");
        });

        it("rejects title with only whitespace", () => {
          const result = validatePackageFormData({
            title: "   ",
            locationName: "Location",
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(false);
          expect(result.errors.title).toContain("Title is required");
        });

        it("rejects null title", () => {
          const result = validatePackageFormData({
            title: null,
            locationName: "Location",
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(false);
          expect(result.errors.title).toContain("Title is required");
        });

        it("rejects undefined title", () => {
          const result = validatePackageFormData({
            locationName: "Location",
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(false);
          expect(result.errors.title).toContain("Title is required");
        });

        it("trims whitespace from title before validation", () => {
          const result = validatePackageFormData({
            title: "  Valid Title  ",
            locationName: "Location",
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(true);
          expect(result.errors.title).toBeUndefined();
        });
      });

      describe("locationName field validation", () => {
        it("accepts valid location_name with exactly 2 characters", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "AB",
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(true);
          expect(result.errors.locationName).toBeUndefined();
        });

        it("accepts valid location_name with exactly 100 characters", () => {
          const location = "L".repeat(100);
          const result = validatePackageFormData({
            title: "Title",
            locationName: location,
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(true);
          expect(result.errors.locationName).toBeUndefined();
        });

        it("accepts valid location_name with typical value", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Cebu City, Philippines",
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(true);
          expect(result.errors.locationName).toBeUndefined();
        });

        it("rejects location_name with fewer than 2 characters", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "A",
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(false);
          expect(result.errors.locationName).toContain(
            "Location name must be at least 2 characters"
          );
        });

        it("rejects location_name with more than 100 characters", () => {
          const location = "L".repeat(101);
          const result = validatePackageFormData({
            title: "Title",
            locationName: location,
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(false);
          expect(result.errors.locationName).toContain(
            "Location name must be at most 100 characters"
          );
        });

        it("rejects empty location_name", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "",
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(false);
          expect(result.errors.locationName).toContain("Location name is required");
        });

        it("rejects null location_name", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: null,
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(false);
          expect(result.errors.locationName).toContain("Location name is required");
        });

        it("trims whitespace from location_name before validation", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "  Valid Location  ",
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(true);
          expect(result.errors.locationName).toBeUndefined();
        });
      });

      describe("description field validation", () => {
        it("accepts valid description with exactly 10 characters", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            description: "1234567890",
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(true);
          expect(result.errors.description).toBeUndefined();
        });

        it("accepts valid description with exactly 3000 characters", () => {
          const description = "A".repeat(3000);
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            description,
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(true);
          expect(result.errors.description).toBeUndefined();
        });

        it("accepts valid description with typical length", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            description: "This is a detailed description of the tour package.",
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(true);
          expect(result.errors.description).toBeUndefined();
        });

        it("accepts null description (optional field)", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            description: null,
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(true);
          expect(result.errors.description).toBeUndefined();
        });

        it("accepts undefined description (optional field)", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(true);
          expect(result.errors.description).toBeUndefined();
        });

        it("accepts empty string description (treated as not provided)", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            description: "",
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(true);
          expect(result.errors.description).toBeUndefined();
        });

        it("accepts whitespace-only description (trimmed to empty)", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            description: "   ",
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(true);
          expect(result.errors.description).toBeUndefined();
        });

        it("rejects description with fewer than 10 characters", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            description: "123456789",
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(false);
          expect(result.errors.description).toContain(
            "Description must be at least 10 characters"
          );
        });

        it("rejects description with more than 3000 characters", () => {
          const description = "A".repeat(3001);
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            description,
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(false);
          expect(result.errors.description).toContain(
            "Description must be at most 3000 characters"
          );
        });

        it("trims whitespace from description before validation", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            description: "  Valid long description text  ",
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(true);
          expect(result.errors.description).toBeUndefined();
        });
      });

      describe("durationValue field validation", () => {
        it("accepts valid durationValue of exactly 0.5", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            durationValue: 0.5,
            durationType: "hours",
          });

          expect(result.valid).toBe(true);
          expect(result.errors.durationValue).toBeUndefined();
        });

        it("accepts valid durationValue of exactly 365", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            durationValue: 365,
            durationType: "hours",
          });

          expect(result.valid).toBe(true);
          expect(result.errors.durationValue).toBeUndefined();
        });

        it("accepts valid durationValue of 1 (integer)", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(true);
          expect(result.errors.durationValue).toBeUndefined();
        });

        it("accepts valid durationValue of 2.5 (decimal)", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            durationValue: 2.5,
            durationType: "hours",
          });

          expect(result.valid).toBe(true);
          expect(result.errors.durationValue).toBeUndefined();
        });

        it("rejects durationValue less than 0.5", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            durationValue: 0.4,
            durationType: "hours",
          });

          expect(result.valid).toBe(false);
          expect(result.errors.durationValue).toContain(
            "Duration must be at least 0.5"
          );
        });

        it("rejects durationValue greater than 365", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            durationValue: 366,
            durationType: "hours",
          });

          expect(result.valid).toBe(false);
          expect(result.errors.durationValue).toContain(
            "Duration must be at most 365"
          );
        });

        it("rejects null durationValue", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            durationValue: null as any,
            durationType: "hours",
          });

          expect(result.valid).toBe(false);
          expect(result.errors.durationValue).toContain("Duration is required");
        });

        it("rejects undefined durationValue", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            durationType: "hours",
          });

          expect(result.valid).toBe(false);
          expect(result.errors.durationValue).toContain("Duration is required");
        });

        it("rejects NaN durationValue", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            durationValue: NaN,
            durationType: "hours",
          });

          expect(result.valid).toBe(false);
          expect(result.errors.durationValue).toContain("Duration is required");
        });

        it("rejects string durationValue", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            durationValue: "1" as any,
            durationType: "hours",
          });

          expect(result.valid).toBe(false);
          expect(result.errors.durationValue).toContain("Duration is required");
        });
      });

      describe("durationType field validation", () => {
        it("accepts valid durationType of 'hours'", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            durationValue: 1,
            durationType: "hours",
          });

          expect(result.valid).toBe(true);
          expect(result.errors.durationType).toBeUndefined();
        });

        it("accepts valid durationType of 'days'", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            durationValue: 1,
            durationType: "days",
          });

          expect(result.valid).toBe(true);
          expect(result.errors.durationType).toBeUndefined();
        });

        it("rejects invalid durationType", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            durationValue: 1,
            durationType: "weeks" as any,
          });

          expect(result.valid).toBe(false);
          expect(result.errors.durationType).toContain(
            "Duration type must be either 'hours' or 'days'"
          );
        });

        it("rejects null durationType", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            durationValue: 1,
            durationType: null as any,
          });

          expect(result.valid).toBe(false);
          expect(result.errors.durationType).toContain("Duration type is required");
        });

        it("rejects undefined durationType", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            durationValue: 1,
          });

          expect(result.valid).toBe(false);
          expect(result.errors.durationType).toContain("Duration type is required");
        });

        it("rejects empty durationType", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            durationValue: 1,
            durationType: "",
          });

          expect(result.valid).toBe(false);
          expect(result.errors.durationType).toContain("Duration type is required");
        });

        it("rejects case-variant of 'hours'", () => {
          const result = validatePackageFormData({
            title: "Title",
            locationName: "Location",
            durationValue: 1,
            durationType: "Hours" as any,
          });

          expect(result.valid).toBe(false);
          expect(result.errors.durationType).toContain(
            "Duration type must be either 'hours' or 'days'"
          );
        });
      });

      describe("multiple field validation", () => {
        it("returns all errors for all invalid fields", () => {
          const result = validatePackageFormData({
            title: "AB",
            locationName: "A",
            description: "short",
            durationValue: 0.3,
            durationType: "weeks" as any,
          });

          expect(result.valid).toBe(false);
          expect(result.errors.title).toBeDefined();
          expect(result.errors.locationName).toBeDefined();
          expect(result.errors.description).toBeDefined();
          expect(result.errors.durationValue).toBeDefined();
          expect(result.errors.durationType).toBeDefined();
        });

        it("handles mixed valid and invalid fields", () => {
          const result = validatePackageFormData({
            title: "Valid Title",
            locationName: "A", // invalid: too short
            description: "Valid long description",
            durationValue: 1,
            durationType: "hours", // valid
          });

          expect(result.valid).toBe(false);
          expect(result.errors.title).toBeUndefined();
          expect(result.errors.locationName).toBeDefined();
          expect(result.errors.description).toBeUndefined();
          expect(result.errors.durationValue).toBeUndefined();
          expect(result.errors.durationType).toBeUndefined();
        });

        it("validates all fields correctly when all are valid", () => {
          const result = validatePackageFormData({
            title: "Beach Resort Experience",
            locationName: "Boracay, Philippines",
            description: "Experience the pristine beaches and crystal-clear waters.",
            durationValue: 3.5,
            durationType: "days",
          });

          expect(result.valid).toBe(true);
          expect(Object.keys(result.errors)).toHaveLength(0);
        });
      });
    });
  });

  describe("edge cases and boundary conditions", () => {
    it("handles partial input object gracefully", () => {
      const result = validatePackageFormData({
        title: "Title",
      });

      expect(result.valid).toBe(false);
      expect(result.errors.locationName).toBeDefined();
      expect(result.errors.durationValue).toBeDefined();
      expect(result.errors.durationType).toBeDefined();
    });

    it("handles empty input object", () => {
      const result = validatePackageFormData({});

      expect(result.valid).toBe(false);
      expect(Object.keys(result.errors).length).toBeGreaterThan(0);
    });

    it("maintains error arrays structure", () => {
      const result = validatePackageFormData({
        title: "AB",
      });

      expect(Array.isArray(result.errors.title)).toBe(true);
    });

    it("returns single error per field type", () => {
      const result = validatePackageFormData({
        title: "AB",
        locationName: "A",
        durationValue: 0.2,
        durationType: "invalid" as any,
      });

      expect(result.errors.title).toHaveLength(1);
      expect(result.errors.locationName).toHaveLength(1);
      expect(result.errors.durationValue).toHaveLength(1);
      expect(result.errors.durationType).toHaveLength(1);
    });
  });
});
