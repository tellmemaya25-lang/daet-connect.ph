import { uploadPackageImage, deletePackageImage } from "./actions";
import * as serverAuth from "@/lib/tours/server-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Mock dependencies
jest.mock("@/lib/tours/server-auth");
jest.mock("@/lib/supabase/server");

describe("Image Handling Server Actions", () => {
  let mockSessionClient: any;
  let mockStorage: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock storage object
    mockStorage = {
      from: jest.fn().mockReturnThis(),
      upload: jest.fn(),
      remove: jest.fn(),
      getPublicUrl: jest.fn(),
    };

    // Mock Supabase server client
    mockSessionClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(),
      storage: mockStorage,
    };

    (createSupabaseServerClient as jest.Mock).mockResolvedValue(mockSessionClient);
  });

  describe("uploadPackageImage", () => {
    describe("Task 2.13: Upload Package Image", () => {
      it("should upload image and return URL on success", async () => {
        // Setup
        const packageId = "00000000-0000-4000-8000-000000000001";
        const operatorId = "00000000-0000-4000-8000-000000000002";
        const mockFile = new File(["fake image data"], "test.jpg", {
          type: "image/jpeg",
        });

        jest
          .spyOn(serverAuth, "getAuthenticatedSession")
          .mockResolvedValueOnce({
            user: { id: "user-123" },
            role: "operator",
            error: null,
          } as any);

        mockSessionClient.from().select().eq().maybeSingle.mockResolvedValueOnce({
          data: { id: operatorId, accreditation_status: "approved" },
          error: null,
        });

        mockStorage.upload.mockResolvedValueOnce({
          data: { path: `tours-package-media/${operatorId}/${packageId}/mock-uuid.jpg` },
          error: null,
        });

        mockStorage.getPublicUrl.mockReturnValueOnce({
          data: {
            publicUrl: `https://project.supabase.co/storage/v1/object/public/tours-package-media/${operatorId}/${packageId}/mock-uuid.jpg`,
          },
        });

        const formData = new FormData();
        formData.append("file", mockFile);

        // Execute
        const result = await uploadPackageImage(packageId, formData);

        // Assert
        expect(result.success).toBe(true);
        expect(result.imageUrl).toBeDefined();
        expect(result.error).toBeUndefined();
      });

      it("should validate file format (jpg, jpeg, png, webp only)", async () => {
        const packageId = "00000000-0000-4000-8000-000000000001";
        const invalidFile = new File(["fake data"], "test.gif", {
          type: "image/gif",
        });

        jest
          .spyOn(serverAuth, "getAuthenticatedSession")
          .mockResolvedValueOnce({
            user: { id: "user-123" },
            role: "operator",
            error: null,
          } as any);

        mockSessionClient.from().select().eq().maybeSingle.mockResolvedValueOnce({
          data: { id: "operator-123", accreditation_status: "approved" },
          error: null,
        });

        const formData = new FormData();
        formData.append("file", invalidFile);

        // Execute
        const result = await uploadPackageImage(packageId, formData);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain(
          "Invalid file format. Only JPG, PNG, and WebP are allowed."
        );
      });

      it("should validate file size (max 5MB)", async () => {
        const packageId = "00000000-0000-4000-8000-000000000001";

        jest
          .spyOn(serverAuth, "getAuthenticatedSession")
          .mockResolvedValueOnce({
            user: { id: "user-123" },
            role: "operator",
            error: null,
          } as any);

        mockSessionClient.from().select().eq().maybeSingle.mockResolvedValueOnce({
          data: { id: "operator-123", accreditation_status: "approved" },
          error: null,
        });

        // Create mock file that's too large (> 5MB)
        const largeData = new Uint8Array(6 * 1024 * 1024); // 6MB
        const largeFile = new File([largeData], "large.jpg", {
          type: "image/jpeg",
        });

        const formData = new FormData();
        formData.append("file", largeFile);

        // Execute
        const result = await uploadPackageImage(packageId, formData);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain(
          "File size too large. Maximum size is 5MB."
        );
      });

      it("should return 401 error if not authenticated", async () => {
        const packageId = "00000000-0000-4000-8000-000000000001";
        const mockFile = new File(["data"], "test.jpg", { type: "image/jpeg" });

        jest.spyOn(serverAuth, "getAuthenticatedSession").mockResolvedValueOnce({
          user: null,
          role: null,
          error: "Auth error",
        } as any);

        const formData = new FormData();
        formData.append("file", mockFile);

        // Execute
        const result = await uploadPackageImage(packageId, formData);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain("Authentication required");
      });

      it("should return 403 error if operator is not approved", async () => {
        const packageId = "00000000-0000-4000-8000-000000000001";
        const mockFile = new File(["data"], "test.jpg", { type: "image/jpeg" });

        jest
          .spyOn(serverAuth, "getAuthenticatedSession")
          .mockResolvedValueOnce({
            user: { id: "user-123" },
            role: "operator",
            error: null,
          } as any);

        mockSessionClient.from().select().eq().maybeSingle.mockResolvedValueOnce({
          data: { id: "operator-123", accreditation_status: "pending" },
          error: null,
        });

        const formData = new FormData();
        formData.append("file", mockFile);

        // Execute
        const result = await uploadPackageImage(packageId, formData);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain("approved");
      });

      it("should generate unique imageId (UUID) for each upload", async () => {
        const packageId = "00000000-0000-4000-8000-000000000001";
        const operatorId = "00000000-0000-4000-8000-000000000002";
        const mockFile = new File(["data"], "test.jpg", { type: "image/jpeg" });

        jest
          .spyOn(serverAuth, "getAuthenticatedSession")
          .mockResolvedValueOnce({
            user: { id: "user-123" },
            role: "operator",
            error: null,
          } as any);

        mockSessionClient.from().select().eq().maybeSingle.mockResolvedValueOnce({
          data: { id: operatorId, accreditation_status: "approved" },
          error: null,
        });

        mockStorage.upload.mockResolvedValueOnce({
          data: { path: `tours-package-media/${operatorId}/${packageId}/uuid.jpg` },
          error: null,
        });

        mockStorage.getPublicUrl.mockReturnValueOnce({
          data: { publicUrl: "https://example.com/image.jpg" },
        });

        const formData = new FormData();
        formData.append("file", mockFile);

        // Execute first upload
        await uploadPackageImage(packageId, formData);

        // Get the call arguments to check path structure
        const uploadCall = mockStorage.upload.mock.calls[0];
        const uploadPath = uploadCall[0]; // First argument is the storage path

        // Verify path structure
        expect(uploadPath).toMatch(
          /tours-package-media\/.*\/.*\/[a-f0-9-]{36}\.jpg/i
        );
      });

      it("should create correct storage path structure", async () => {
        const packageId = "00000000-0000-4000-8000-000000000001";
        const operatorId = "00000000-0000-4000-8000-000000000002";
        const mockFile = new File(["data"], "test.png", { type: "image/png" });

        jest
          .spyOn(serverAuth, "getAuthenticatedSession")
          .mockResolvedValueOnce({
            user: { id: "user-123" },
            role: "operator",
            error: null,
          } as any);

        mockSessionClient.from().select().eq().maybeSingle.mockResolvedValueOnce({
          data: { id: operatorId, accreditation_status: "approved" },
          error: null,
        });

        mockStorage.upload.mockResolvedValueOnce({
          data: { path: "tours-package-media/op/pkg/img.png" },
          error: null,
        });

        mockStorage.getPublicUrl.mockReturnValueOnce({
          data: { publicUrl: "https://example.com/image.png" },
        });

        const formData = new FormData();
        formData.append("file", mockFile);

        // Execute
        await uploadPackageImage(packageId, formData);

        // Verify upload was called with correct path pattern
        expect(mockStorage.upload).toHaveBeenCalledWith(
          expect.stringContaining("tours-package-media"),
          mockFile,
          expect.objectContaining({
            contentType: "image/png",
          })
        );
      });

      it("should return error if no file provided", async () => {
        const packageId = "00000000-0000-4000-8000-000000000001";

        jest
          .spyOn(serverAuth, "getAuthenticatedSession")
          .mockResolvedValueOnce({
            user: { id: "user-123" },
            role: "operator",
            error: null,
          } as any);

        mockSessionClient.from().select().eq().maybeSingle.mockResolvedValueOnce({
          data: { id: "operator-123", accreditation_status: "approved" },
          error: null,
        });

        const formData = new FormData(); // No file

        // Execute
        const result = await uploadPackageImage(packageId, formData);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain("No file provided");
      });
    });
  });

  describe("deletePackageImage", () => {
    describe("Task 2.14: Delete Package Image", () => {
      it("should delete image from draft package successfully", async () => {
        const packageId = "00000000-0000-4000-8000-000000000001";
        const operatorId = "00000000-0000-4000-8000-000000000002";
        const imageUrl =
          "https://project.supabase.co/storage/v1/object/public/tours-package-media/op/pkg/img.jpg";

        jest
          .spyOn(serverAuth, "getAuthenticatedSession")
          .mockResolvedValueOnce({
            user: { id: "user-123" },
            role: "operator",
            error: null,
          } as any);

        mockSessionClient.from().select().eq().maybeSingle
          .mockResolvedValueOnce({
            data: { id: operatorId, accreditation_status: "approved" },
            error: null,
          })
          .mockResolvedValueOnce({
            data: {
              id: packageId,
              operator_id: operatorId,
              status: "draft",
            },
            error: null,
          });

        mockStorage.remove.mockResolvedValueOnce({ error: null });

        // Execute
        const result = await deletePackageImage(packageId, imageUrl);

        // Assert
        expect(result.success).toBe(true);
        expect(result.message).toContain("deleted successfully");
        expect(mockStorage.remove).toHaveBeenCalled();
      });

      it("should verify package ownership before deletion", async () => {
        const packageId = "00000000-0000-4000-8000-000000000001";
        const operatorId = "00000000-0000-4000-8000-000000000002";
        const differentOperatorId = "00000000-0000-4000-8000-000000000003";
        const imageUrl =
          "https://project.supabase.co/storage/v1/object/public/tours-package-media/op/pkg/img.jpg";

        jest
          .spyOn(serverAuth, "getAuthenticatedSession")
          .mockResolvedValueOnce({
            user: { id: "user-123" },
            role: "operator",
            error: null,
          } as any);

        mockSessionClient.from().select().eq().maybeSingle
          .mockResolvedValueOnce({
            data: { id: operatorId, accreditation_status: "approved" },
            error: null,
          })
          .mockResolvedValueOnce({
            data: {
              id: packageId,
              operator_id: differentOperatorId, // Different owner
              status: "draft",
            },
            error: null,
          });

        // Execute
        const result = await deletePackageImage(packageId, imageUrl);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain("do not own this package");
      });

      it("should only allow deletion from draft packages", async () => {
        const packageId = "00000000-0000-4000-8000-000000000001";
        const operatorId = "00000000-0000-4000-8000-000000000002";
        const imageUrl =
          "https://project.supabase.co/storage/v1/object/public/tours-package-media/op/pkg/img.jpg";

        jest
          .spyOn(serverAuth, "getAuthenticatedSession")
          .mockResolvedValueOnce({
            user: { id: "user-123" },
            role: "operator",
            error: null,
          } as any);

        mockSessionClient.from().select().eq().maybeSingle
          .mockResolvedValueOnce({
            data: { id: operatorId, accreditation_status: "approved" },
            error: null,
          })
          .mockResolvedValueOnce({
            data: {
              id: packageId,
              operator_id: operatorId,
              status: "published", // Not draft
            },
            error: null,
          });

        // Execute
        const result = await deletePackageImage(packageId, imageUrl);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain("draft packages");
      });

      it("should extract storage path from public URL", async () => {
        const packageId = "00000000-0000-4000-8000-000000000001";
        const operatorId = "00000000-0000-4000-8000-000000000002";
        const imageUrl =
          "https://project.supabase.co/storage/v1/object/public/tours-package-media/op/pkg/img.jpg";

        jest
          .spyOn(serverAuth, "getAuthenticatedSession")
          .mockResolvedValueOnce({
            user: { id: "user-123" },
            role: "operator",
            error: null,
          } as any);

        mockSessionClient.from().select().eq().maybeSingle
          .mockResolvedValueOnce({
            data: { id: operatorId, accreditation_status: "approved" },
            error: null,
          })
          .mockResolvedValueOnce({
            data: {
              id: packageId,
              operator_id: operatorId,
              status: "draft",
            },
            error: null,
          });

        mockStorage.remove.mockResolvedValueOnce({ error: null });

        // Execute
        await deletePackageImage(packageId, imageUrl);

        // Verify path extraction: everything after /public/<bucket>/
        expect(mockStorage.remove).toHaveBeenCalledWith(["op/pkg/img.jpg"]);
      });

      it("should return 401 error if not authenticated", async () => {
        const packageId = "00000000-0000-4000-8000-000000000001";
        const imageUrl =
          "https://project.supabase.co/storage/v1/object/public/tours-package-media/op/pkg/img.jpg";

        jest.spyOn(serverAuth, "getAuthenticatedSession").mockResolvedValueOnce({
          user: null,
          role: null,
          error: "Auth error",
        } as any);

        // Execute
        const result = await deletePackageImage(packageId, imageUrl);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain("Authentication required");
      });

      it("should return 404 error if package not found", async () => {
        const packageId = "00000000-0000-4000-8000-000000000001";
        const operatorId = "00000000-0000-4000-8000-000000000002";
        const imageUrl =
          "https://project.supabase.co/storage/v1/object/public/tours-package-media/op/pkg/img.jpg";

        jest
          .spyOn(serverAuth, "getAuthenticatedSession")
          .mockResolvedValueOnce({
            user: { id: "user-123" },
            role: "operator",
            error: null,
          } as any);

        mockSessionClient.from().select().eq().maybeSingle
          .mockResolvedValueOnce({
            data: { id: operatorId, accreditation_status: "approved" },
            error: null,
          })
          .mockResolvedValueOnce({
            data: null, // Package not found
            error: null,
          });

        // Execute
        const result = await deletePackageImage(packageId, imageUrl);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain("Package not found");
      });

      it("should handle storage deletion errors gracefully", async () => {
        const packageId = "00000000-0000-4000-8000-000000000001";
        const operatorId = "00000000-0000-4000-8000-000000000002";
        const imageUrl =
          "https://project.supabase.co/storage/v1/object/public/tours-package-media/op/pkg/img.jpg";

        jest
          .spyOn(serverAuth, "getAuthenticatedSession")
          .mockResolvedValueOnce({
            user: { id: "user-123" },
            role: "operator",
            error: null,
          } as any);

        mockSessionClient.from().select().eq().maybeSingle
          .mockResolvedValueOnce({
            data: { id: operatorId, accreditation_status: "approved" },
            error: null,
          })
          .mockResolvedValueOnce({
            data: {
              id: packageId,
              operator_id: operatorId,
              status: "draft",
            },
            error: null,
          });

        mockStorage.remove.mockResolvedValueOnce({
          error: new Error("Storage error"),
        });

        // Execute
        const result = await deletePackageImage(packageId, imageUrl);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain("Failed to delete image");
      });
    });
  });
});
