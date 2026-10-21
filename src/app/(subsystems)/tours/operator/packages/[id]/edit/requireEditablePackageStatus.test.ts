import { requireEditablePackageStatus } from "./actions";
import { PackageStatus } from "@/lib/tours/package-contract";

/**
 * Unit tests for requireEditablePackageStatus helper
 * 
 * **Property 2: Draft Packages Allow Unrestricted Editing**
 * **Property 3: Published Packages Restrict Certain Operations**
 * **Property 4: Pending Review Packages Block All Edits**
 * **Property 5: Archived Packages Block All Edits**
 * **Property 6: Rejected Packages Allow Resubmission**
 * 
 * **Validates: Requirements 2.1-2.5**
 */

describe("requireEditablePackageStatus", () => {
  // Property 2: Draft status allows all edits
  describe("Draft status - allows unrestricted editing", () => {
    test("should allow editing any fields when status is draft", async () => {
      const result = await requireEditablePackageStatus("draft", [
        "title",
        "description",
        "locationName",
      ]);

      expect(result).toHaveProperty("data");
      expect(result.data?.isEditable).toBe(true);
      expect(result.data?.status).toBe("draft");
    });

    test("should allow editing with empty fields array when status is draft", async () => {
      const result = await requireEditablePackageStatus("draft", []);

      expect(result).toHaveProperty("data");
      expect(result.data?.isEditable).toBe(true);
      expect(result.data?.status).toBe("draft");
    });

    test("should allow editing without fields parameter when status is draft", async () => {
      const result = await requireEditablePackageStatus("draft");

      expect(result).toHaveProperty("data");
      expect(result.data?.isEditable).toBe(true);
      expect(result.data?.status).toBe("draft");
    });

    test("should allow restricted operations like addPriceVariant in draft status", async () => {
      const result = await requireEditablePackageStatus("draft", [
        "addPriceVariant",
        "deleteStop",
        "reorderGallery",
      ]);

      expect(result).toHaveProperty("data");
      expect(result.data?.isEditable).toBe(true);
      expect(result.data?.status).toBe("draft");
    });
  });

  // Property 6: Rejected status allows resubmission
  describe("Rejected status - allows unrestricted editing", () => {
    test("should allow editing any fields when status is rejected", async () => {
      const result = await requireEditablePackageStatus("rejected", [
        "title",
        "description",
      ]);

      expect(result).toHaveProperty("data");
      expect(result.data?.isEditable).toBe(true);
      expect(result.data?.status).toBe("rejected");
    });

    test("should allow restricted operations in rejected status", async () => {
      const result = await requireEditablePackageStatus("rejected", [
        "addPriceVariant",
        "deleteInclusion",
      ]);

      expect(result).toHaveProperty("data");
      expect(result.data?.isEditable).toBe(true);
      expect(result.data?.status).toBe("rejected");
    });
  });

  // Property 4: Pending review blocks all edits
  describe("Pending review status - blocks all edits", () => {
    test("should return 403 error when status is pending_review", async () => {
      const result = await requireEditablePackageStatus("pending_review", []);

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
      expect(result.error?.message).toBe(
        "Package is under review and cannot be edited"
      );
    });

    test("should return same error even with allowed fields in pending_review", async () => {
      const result = await requireEditablePackageStatus("pending_review", [
        "title",
        "description",
      ]);

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
      expect(result.error?.message).toBe(
        "Package is under review and cannot be edited"
      );
    });

    test("should return same error without fields parameter in pending_review", async () => {
      const result = await requireEditablePackageStatus("pending_review");

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
    });
  });

  // Property 5: Archived blocks all edits
  describe("Archived status - blocks all edits", () => {
    test("should return 403 error when status is archived", async () => {
      const result = await requireEditablePackageStatus("archived", []);

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
      expect(result.error?.message).toBe(
        "Archived packages cannot be edited"
      );
    });

    test("should return same error even with allowed fields in archived", async () => {
      const result = await requireEditablePackageStatus("archived", [
        "title",
        "galleryCaption",
      ]);

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
      expect(result.error?.message).toBe(
        "Archived packages cannot be edited"
      );
    });
  });

  // Property 3: Published restricts certain operations
  describe("Published status - restricts certain operations", () => {
    test("should allow editing allowed fields in published status", async () => {
      const result = await requireEditablePackageStatus("published", [
        "title",
        "description",
        "galleryCaption",
      ]);

      expect(result).toHaveProperty("data");
      expect(result.data?.isEditable).toBe(true);
      expect(result.data?.status).toBe("published");
      expect(result.data?.allowedFields).toContain("title");
      expect(result.data?.allowedFields).toContain("description");
      expect(result.data?.allowedFields).toContain("galleryCaption");
    });

    test("should return allowed and restricted field lists for published status", async () => {
      const result = await requireEditablePackageStatus("published", []);

      expect(result).toHaveProperty("data");
      expect(result.data?.allowedFields).toEqual([
        "title",
        "locationName",
        "description",
        "durationType",
        "inclusionItemText",
        "inclusionToggle",
        "galleryCaption",
        "stopLocationName",
        "stopDescription",
        "stopLatitude",
        "stopLongitude",
      ]);
      expect(result.data?.restrictedFields).toContain("addPriceVariant");
      expect(result.data?.restrictedFields).toContain("deletePriceVariant");
      expect(result.data?.restrictedFields).toContain("editPricePerPax");
    });

    test("should block addPriceVariant operation in published status", async () => {
      const result = await requireEditablePackageStatus("published", [
        "addPriceVariant",
      ]);

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
      expect(result.error?.message).toContain("Published packages cannot edit");
      expect(result.error?.message).toContain("addPriceVariant");
    });

    test("should block deletePriceVariant operation in published status", async () => {
      const result = await requireEditablePackageStatus("published", [
        "deletePriceVariant",
      ]);

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
      expect(result.error?.message).toContain("Published packages cannot edit");
    });

    test("should block editPricePerPax operation in published status", async () => {
      const result = await requireEditablePackageStatus("published", [
        "editPricePerPax",
      ]);

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
    });

    test("should block editFlatPrice operation in published status", async () => {
      const result = await requireEditablePackageStatus("published", [
        "editFlatPrice",
      ]);

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
    });

    test("should block addStop operation in published status", async () => {
      const result = await requireEditablePackageStatus("published", [
        "addStop",
      ]);

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
    });

    test("should block deleteStop operation in published status", async () => {
      const result = await requireEditablePackageStatus("published", [
        "deleteStop",
      ]);

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
    });

    test("should block reorderStops operation in published status", async () => {
      const result = await requireEditablePackageStatus("published", [
        "reorderStops",
      ]);

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
    });

    test("should block addGalleryImage operation in published status", async () => {
      const result = await requireEditablePackageStatus("published", [
        "addGalleryImage",
      ]);

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
    });

    test("should block deleteGalleryImage operation in published status", async () => {
      const result = await requireEditablePackageStatus("published", [
        "deleteGalleryImage",
      ]);

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
    });

    test("should block reorderGallery operation in published status", async () => {
      const result = await requireEditablePackageStatus("published", [
        "reorderGallery",
      ]);

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
    });

    test("should block addInclusion operation in published status", async () => {
      const result = await requireEditablePackageStatus("published", [
        "addInclusion",
      ]);

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
    });

    test("should block deleteInclusion operation in published status", async () => {
      const result = await requireEditablePackageStatus("published", [
        "deleteInclusion",
      ]);

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
    });

    test("should block reorderInclusions operation in published status", async () => {
      const result = await requireEditablePackageStatus("published", [
        "reorderInclusions",
      ]);

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
    });

    test("should allow editing stopLocationName and stopDescription in published status", async () => {
      const result = await requireEditablePackageStatus("published", [
        "stopLocationName",
        "stopDescription",
        "stopLatitude",
        "stopLongitude",
      ]);

      expect(result).toHaveProperty("data");
      expect(result.data?.isEditable).toBe(true);
    });

    test("should allow editing inclusionItemText and inclusionToggle in published status", async () => {
      const result = await requireEditablePackageStatus("published", [
        "inclusionItemText",
        "inclusionToggle",
      ]);

      expect(result).toHaveProperty("data");
      expect(result.data?.isEditable).toBe(true);
    });

    test("should return detailed error message for multiple restricted fields", async () => {
      const result = await requireEditablePackageStatus("published", [
        "addPriceVariant",
        "deleteStop",
        "reorderGallery",
      ]);

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
      expect(result.error?.message).toContain("Published packages cannot edit");
      // Should list first two and indicate more
      const msg = result.error?.message || "";
      expect(msg).toMatch(/addPriceVariant|deleteStop/);
    });

    test("should allow with empty fields array in published status", async () => {
      const result = await requireEditablePackageStatus("published", []);

      expect(result).toHaveProperty("data");
      expect(result.data?.isEditable).toBe(true);
      expect(result.data?.status).toBe("published");
    });

    test("should block editVariantName in published status", async () => {
      const result = await requireEditablePackageStatus("published", [
        "editVariantName",
      ]);

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
    });

    test("should block editMinMaxPax in published status", async () => {
      const result = await requireEditablePackageStatus("published", [
        "editMinMaxPax",
      ]);

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
    });
  });

  // Additional edge cases
  describe("Edge cases", () => {
    test("should handle mixed allowed and restricted fields correctly", async () => {
      // When both allowed and restricted fields are provided, should only fail if restricted found
      const result = await requireEditablePackageStatus("published", [
        "title", // allowed
        "description", // allowed
        "addPriceVariant", // restricted
      ]);

      expect(result).toHaveProperty("error");
      expect(result.error?.status).toBe(403);
    });

    test("should return consistent error type structure", async () => {
      const resultPending = await requireEditablePackageStatus("pending_review");
      const resultArchived = await requireEditablePackageStatus("archived");

      expect(resultPending).toHaveProperty("error.status");
      expect(resultPending).toHaveProperty("error.message");
      expect(resultArchived).toHaveProperty("error.status");
      expect(resultArchived).toHaveProperty("error.message");
    });

    test("should return consistent success type structure", async () => {
      const resultDraft = await requireEditablePackageStatus("draft");
      const resultRejected = await requireEditablePackageStatus("rejected");

      expect(resultDraft).toHaveProperty("data.isEditable");
      expect(resultDraft).toHaveProperty("data.status");
      expect(resultRejected).toHaveProperty("data.isEditable");
      expect(resultRejected).toHaveProperty("data.status");
    });
  });
});
