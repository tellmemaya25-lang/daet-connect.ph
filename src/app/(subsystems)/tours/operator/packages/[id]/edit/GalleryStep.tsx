"use client";

import React, { useCallback, useState } from "react";
import Image from "next/image";
import type { EditGalleryImage, EditPackageStatus, ValidationErrors, StepProps } from "./edit-types";
import { uploadPackageImage, deletePackageImage } from "./actions";
import { EDIT_LIMITS, ALLOWED_IMAGE_EXTENSIONS, ALLOWED_IMAGE_TYPES } from "./edit-constants";
import { getEditPermissions } from "./permissions";

type GalleryStepProps = StepProps<EditGalleryImage[]> & { packageId: string };

/**
 * GalleryStep Component
 *
 * Manages gallery images with:
 * - Grid display of existing images sorted by display_order
 * - Add image upload form
 * - Edit caption functionality
 * - Delete image with confirmation
 * - Reorder functionality
 */
export function GalleryStep({
  packageId,
  data,
  originalData,
  packageStatus,
  onUpdate,
  errors,
  loading,
}: GalleryStepProps) {
  const permissions = getEditPermissions(packageStatus);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editingCaption, setEditingCaption] = useState<string | undefined>();
  const [deletingId, setDeletingId] = useState<string | undefined>();

  const canAddImages = permissions.gallery.add;
  const canEditCaptions = permissions.gallery.editCaption;
  const canRemoveImages = permissions.gallery.remove;
  const canReorder = permissions.gallery.reorder;

  // Get gallery errors
  const getGalleryErrors = useCallback(() => {
    const stepErrors: Record<string, string> = {};
    Object.entries(errors).forEach(([key, value]) => {
      if (key.startsWith("galleryImages")) {
        stepErrors[key] = value;
      }
    });
    return stepErrors;
  }, [errors]);

  const sortedImages = [...data].sort((a, b) => a.displayOrder - b.displayOrder);

  const validateImage = (file: File): string | null => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as typeof ALLOWED_IMAGE_TYPES[number])) {
      const allowed = ALLOWED_IMAGE_EXTENSIONS.join(", ");
      return `Invalid file format. Please upload: ${allowed}`;
    }

    if (file.size > EDIT_LIMITS.imageBytes) {
      const maxMb = EDIT_LIMITS.imageBytes / (1024 * 1024);
      return `File size exceeds ${maxMb}MB limit`;
    }

    return null;
  };

  const handleImageUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (data.length >= EDIT_LIMITS.maxGalleryImages) {
        setUploadError(`Maximum ${EDIT_LIMITS.maxGalleryImages} images allowed`);
        return;
      }

      const validationError = validateImage(file);
      if (validationError) {
        setUploadError(validationError);
        return;
      }

      setUploadLoading(true);
      setUploadError(null);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const result = await uploadPackageImage(packageId, formData);

        if (result.success && result.imageUrl) {
          const newImage: EditGalleryImage = {
            id: `new-${Date.now()}`,
            imageUrl: result.imageUrl,
            caption: null,
            displayOrder: data.length,
          };

          onUpdate([...data, newImage]);
        } else {
          setUploadError(result.error?.message ?? "Failed to upload image");
        }
      } catch (error) {
        setUploadError("An error occurred during upload");
      } finally {
        setUploadLoading(false);
        event.target.value = "";
      }
    },
    [data, onUpdate, packageId]
  );

  const handleDeleteImage = useCallback(
    async (imageId: string | undefined, imageUrl: string) => {
      if (!imageId) return;

      setDeletingId(imageId);

      try {
        // Try to delete from storage if it's an uploaded image
        if (imageUrl.includes("http")) {
          await deletePackageImage(packageId, imageUrl);
        }

        // Remove from gallery
        onUpdate(data.filter((img) => img.id !== imageId));
      } catch (error) {
        setUploadError("Failed to delete image");
      } finally {
        setDeletingId(undefined);
      }
    },
    [data, onUpdate, packageId]
  );

  const handleUpdateCaption = useCallback(
    (imageId: string | undefined, newCaption: string) => {
      if (!imageId) return;

      onUpdate(
        data.map((img) =>
          img.id === imageId ? { ...img, caption: newCaption || null } : img
        )
      );
      setEditingCaption(undefined);
    },
    [data, onUpdate, packageId]
  );

  const handleReorder = useCallback(
    (direction: "up" | "down", index: number) => {
      if (direction === "up" && index === 0) return;
      if (direction === "down" && index === sortedImages.length - 1) return;

      const newOrder = [...sortedImages];
      const [removed] = newOrder.splice(index, 1);
      newOrder.splice(direction === "up" ? index - 1 : index + 1, 0, removed);

      const reordered = newOrder.map((img, i) => ({
        ...img,
        displayOrder: i,
      }));

      onUpdate(reordered);
    },
    [sortedImages, onUpdate]
  );

  const galleryErrors = getGalleryErrors();

  return (
    <div className="border rounded-lg p-6 bg-white">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Gallery Images</h2>
          <p className="text-sm text-gray-600 mt-1">
            {data.length}/{EDIT_LIMITS.maxGalleryImages} images
          </p>
        </div>
        {canAddImages && data.length < EDIT_LIMITS.maxGalleryImages && (
          <label htmlFor="gallery-upload" className="cursor-pointer">
            <div
              className={`px-4 py-2 rounded-lg font-medium transition text-center ${
                uploadLoading || loading
                  ? "bg-gray-100 text-gray-500 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {uploadLoading ? "Uploading..." : "+ Add Image"}
            </div>
            <input
              id="gallery-upload"
              type="file"
              accept={ALLOWED_IMAGE_TYPES.join(",")}
              onChange={handleImageUpload}
              disabled={uploadLoading || loading}
              className="hidden"
            />
          </label>
        )}
      </div>

      {/* Upload Error */}
      {uploadError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800 flex items-start gap-2">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span>{uploadError}</span>
        </div>
      )}

      {/* Gallery Grid */}
      {sortedImages.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {sortedImages.map((image, index) => (
            <div
              key={image.id}
              className="border rounded-lg overflow-hidden bg-gray-50 hover:shadow-lg transition"
            >
              {/* Image Thumbnail */}
              <div className="relative h-40 w-full bg-gray-100">
                <Image
                  src={image.imageUrl}
                  alt={image.caption || "Gallery image"}
                  fill
                  className="object-cover"
                  onError={() => {
                    setUploadError("Failed to load image preview");
                  }}
                />
                <div className="absolute top-2 right-2 bg-gray-800 text-white px-2 py-1 rounded text-xs font-medium">
                  {index + 1}
                </div>
              </div>

              {/* Caption */}
              <div className="p-3">
                {editingCaption === image.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={image.caption || ""}
                      onChange={(e) => {
                        const updated = data.map((img) =>
                          img.id === image.id ? { ...img, caption: e.target.value } : img
                        );
                        onUpdate(updated);
                      }}
                      maxLength={EDIT_LIMITS.caption.max}
                      rows={2}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="Add caption (optional)"
                    />
                    <button
                      type="button"
                      onClick={() => handleUpdateCaption(image.id, image.caption || "")}
                      className="w-full px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <>
                    {image.caption ? (
                      <p className="text-sm text-gray-700 line-clamp-2 mb-2">{image.caption}</p>
                    ) : (
                      <p className="text-sm text-gray-400 italic mb-2">No caption</p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-1 flex-wrap">
                      {canReorder && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleReorder("up", index)}
                            disabled={index === 0 || loading}
                            className="flex-1 px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReorder("down", index)}
                            disabled={index === sortedImages.length - 1 || loading}
                            className="flex-1 px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Move down"
                          >
                            ↓
                          </button>
                        </>
                      )}
                      {canEditCaptions && (
                        <button
                          type="button"
                          onClick={() => setEditingCaption(image.id)}
                          disabled={loading}
                          className="flex-1 px-2 py-1 text-xs bg-blue-200 text-blue-700 rounded hover:bg-blue-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Caption
                        </button>
                      )}
                      {canRemoveImages && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm("Delete this image?")) {
                              handleDeleteImage(image.id, image.imageUrl);
                            }
                          }}
                          disabled={loading || deletingId === image.id}
                          className="flex-1 px-2 py-1 text-xs bg-red-200 text-red-700 rounded hover:bg-red-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-sm font-medium">No gallery images yet</p>
          <p className="text-xs mt-1">Upload images to showcase your package</p>
        </div>
      )}

      {/* Validation Errors */}
      {Object.keys(galleryErrors).length > 0 && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
          <p className="font-medium">Gallery errors:</p>
          <ul className="mt-1 space-y-1">
            {Object.entries(galleryErrors).map(([key, message]) => (
              <li key={key}>• {message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Help text */}
      <div className="mt-4 text-xs text-gray-600 space-y-1 p-3 bg-gray-50 rounded">
        <p>Supported formats: {ALLOWED_IMAGE_EXTENSIONS.join(", ")}</p>
        <p>Maximum file size: {EDIT_LIMITS.imageBytes / (1024 * 1024)}MB</p>
        <p>Maximum {EDIT_LIMITS.maxGalleryImages} images per package</p>
      </div>

      {!canAddImages && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
          ℹ️ Gallery images cannot be modified for this package status.
        </div>
      )}
    </div>
  );
}
