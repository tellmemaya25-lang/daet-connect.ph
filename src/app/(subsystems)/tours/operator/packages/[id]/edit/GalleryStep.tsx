"use client";

import React, { useCallback, useState } from "react";
import { useFeedback } from "@/components/ui/feedback";
import Image from "next/image";
import type { EditGalleryImage, EditPackageStatus, ValidationErrors, StepProps } from "./edit-types";
import { uploadPackageImage, deletePackageImage } from "./actions";
import { EDIT_LIMITS, ALLOWED_IMAGE_EXTENSIONS, ALLOWED_IMAGE_TYPES } from "./edit-constants";
import { getEditPermissions } from "./permissions";
import { moveItem, swapItems, withDisplayOrder } from "./edit-order";
import { useFileDrop } from "./use-file-drop";
import { useSortableList } from "./use-sortable-list";

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
  const { toast, confirm } = useFeedback();
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
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

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      const max = EDIT_LIMITS.maxGalleryImages;
      const problems: string[] = [];

      // Anything already in the gallery, plus whatever this batch adds.
      let rolling = [...sortedImages];

      const slots = Math.max(0, max - rolling.length);
      const accepted = files.slice(0, slots);
      const skipped = files.length - accepted.length;

      if (skipped > 0) {
        problems.push(
          accepted.length === 0
            ? `Maximum ${max} images allowed.`
            : `Only ${slots} more image${slots === 1 ? "" : "s"} can be added (maximum ${max}), so ${skipped} ${skipped === 1 ? "file was" : "files were"} skipped.`
        );
      }

      // Reject the bad files up front, naming them when there is more than one.
      const valid: File[] = [];
      for (const file of accepted) {
        const error = validateImage(file);
        if (error) {
          // Name the file when the operator picked a batch, so the error
          // points at the right photo.
          problems.push(accepted.length > 1 ? `${file.name}: ${error}` : error);
        } else {
          valid.push(file);
        }
      }

      setUploadError(problems.length > 0 ? problems.join(" ") : null);
      if (valid.length === 0) return;

      setUploadLoading(true);
      setUploadProgress({ done: 0, total: valid.length });

      let added = 0;
      let processed = 0;
      let index = 0;

      // One at a time: the action takes a single file, and uploading in
      // sequence keeps the numbering consistent as each photo lands.
      for (const file of valid) {
        try {
          const formData = new FormData();
          formData.append("file", file);

          const result = await uploadPackageImage(packageId, formData, "gallery");

          if (result.success && result.imageUrl) {
            index += 1;
            added += 1;
            rolling = [
              ...rolling,
              {
                id: `new-${Date.now()}-${index}`,
                imageUrl: result.imageUrl,
                caption: null,
                displayOrder: rolling.length + 1,
              },
            ];
            onUpdate(withDisplayOrder(rolling));
          } else {
            const message = result.error?.message ?? "Failed to upload image";
            problems.push(valid.length > 1 ? `${file.name}: ${message}` : message);
          }
        } catch (error) {
          problems.push(valid.length > 1 ? `${file.name}: upload failed` : "An error occurred during upload");
        }

        processed += 1;
        setUploadProgress({ done: processed, total: valid.length });
      }

      setUploadLoading(false);
      setUploadProgress(null);
      setUploadError(problems.length > 0 ? problems.join(" ") : null);

      if (added > 1) {
        toast(`${added} photos added. Drag them to set the order.`, "success");
      }
    },
    [sortedImages, onUpdate, packageId, toast]
  );

  const handleImageUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (files.length > 0) void uploadFiles(files);
    },
    [uploadFiles]
  );

  const canAcceptMore = canAddImages && data.length < EDIT_LIMITS.maxGalleryImages;
  const busy = uploadLoading || loading;

  // Drop a photo anywhere on this card to upload it...
  const fileDrop = useFileDrop({
    onFiles: (files) => void uploadFiles(files),
    enabled: canAcceptMore && !busy,
  });

  // ...and drag one photo onto another to reorder. The arrows stay for
  // keyboard and touch, which HTML drag-and-drop cannot serve.
  const sortable = useSortableList({
    enabled: canReorder,
    // Dropping a photo on another swaps the two, leaving the rest of the row
    // where it was. The arrows still step a photo one place at a time.
    onMove: (from, to) => onUpdate(withDisplayOrder(swapItems(sortedImages, from, to))),
  });

  const handleDeleteImage = useCallback(
    async (imageId: string | undefined, imageUrl: string) => {
      if (!imageId) return;

      setDeletingId(imageId);

      try {
        // Try to delete from storage if it's an uploaded image
        if (imageUrl.includes("http")) {
          await deletePackageImage(packageId, imageUrl);
        }

        // Remove from gallery, and close the gap the removal leaves behind
        onUpdate(withDisplayOrder(sortedImages.filter((img) => img.id !== imageId)));
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

      onUpdate(withDisplayOrder(moveItem(sortedImages, index, direction === "up" ? index - 1 : index + 1)));
    },
    [sortedImages, onUpdate]
  );

  const galleryErrors = getGalleryErrors();

  return (
    <div
      {...fileDrop.dropProps}
      className={`border rounded-2xl p-6 bg-surface transition ${
        fileDrop.isDragging ? "border-daet-forest ring-2 ring-daet-forest/40" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-daet-ink">Gallery Images</h2>
          <p className="text-sm text-daet-ink/80 mt-1">
            {data.length}/{EDIT_LIMITS.maxGalleryImages} images
          </p>
          {canAddImages && (
            <p className="text-xs text-daet-ink/70 mt-1">
              Drag photos here to upload them{sortedImages.length > 1 && canReorder ? ", or drag a photo onto another to swap them" : ""}.
            </p>
          )}
        </div>
        {canAddImages && data.length < EDIT_LIMITS.maxGalleryImages && (
          <label htmlFor="gallery-upload" className={uploadLoading ? "cursor-default" : "cursor-pointer"}>
            <div
              role={uploadLoading ? "status" : undefined}
              aria-live={uploadLoading ? "polite" : undefined}
              className={`relative overflow-hidden px-4 py-2 rounded-2xl font-medium transition text-center ${
                uploadLoading
                  ? "bg-daet-forest text-white"
                  : loading
                    ? "bg-muted text-daet-ink/70 cursor-not-allowed"
                    : "bg-daet-forest text-white hover:bg-daet-leaf"
              }`}
            >
              {/* Light-blue fill that grows as the batch uploads: the action
                  reports no byte progress, but the count is real. */}
              {uploadLoading && uploadProgress && uploadProgress.total > 0 && (
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 bg-blue-300/40 transition-[width] duration-300"
                  style={{ width: `${Math.round((uploadProgress.done / uploadProgress.total) * 100)}%` }}
                />
              )}

              <span className="relative inline-flex items-center justify-center gap-2">
                {uploadLoading && (
                  <span
                    aria-hidden
                    className="h-3.5 w-3.5 rounded-full border-2 border-blue-200/50 border-t-blue-200 animate-spin motion-reduce:animate-none"
                  />
                )}
                {uploadLoading
                  ? uploadProgress && uploadProgress.total > 1
                    ? `Uploading ${Math.min(uploadProgress.done + 1, uploadProgress.total)} of ${uploadProgress.total}...`
                    : "Uploading..."
                  : "+ Add Image"}
              </span>
            </div>
            <input
              id="gallery-upload"
              type="file"
              multiple
              accept={ALLOWED_IMAGE_TYPES.join(",")}
              onChange={handleImageUpload}
              disabled={uploadLoading || loading}
              className="hidden"
            />
          </label>
        )}
      </div>

      {fileDrop.isDragging && (
        <p className="mb-4 rounded-2xl border-2 border-dashed border-daet-forest/60 p-3 text-sm font-medium text-daet-forest">
          Drop the photos to upload them.
        </p>
      )}

      {/* Upload Error */}
      {uploadError && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 rounded-2xl text-sm text-red-800 dark:text-red-300 flex items-start gap-2">
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
              {...sortable.getItemProps(index)}
              className={`border rounded-2xl overflow-hidden bg-canvas transition ${
                canReorder ? "cursor-grab active:cursor-grabbing" : ""
              } ${sortable.draggingIndex === index ? "opacity-40" : ""} ${
                sortable.overIndex === index && sortable.draggingIndex !== index
                  ? "ring-2 ring-daet-forest ring-offset-2 ring-offset-canvas"
                  : ""
              }`}
            >
              {/* Image Thumbnail */}
              <div className="relative h-40 w-full bg-muted">
                <Image
                  src={image.imageUrl}
                  alt={image.caption || "Gallery image"}
                  fill
                  className="object-cover"
                  onError={() => {
                    setUploadError("Failed to load image preview");
                  }}
                />
                <div className="absolute top-2 right-2 bg-slate-800 text-white px-2 py-1 rounded-2xl text-xs font-medium">
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
                      className="w-full px-2 py-1 border border-daet-ink/20 rounded-2xl text-sm resize-none focus:ring-2 focus:ring-daet-forest/30 outline-none"
                      placeholder="Add caption (optional)"
                    />
                    <button
                      type="button"
                      onClick={() => handleUpdateCaption(image.id, image.caption || "")}
                      className="w-full px-2 py-1 bg-daet-forest text-white text-xs rounded-2xl hover:bg-daet-leaf transition"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <>
                    {image.caption ? (
                      <p className="text-sm text-daet-ink/80 line-clamp-2 mb-2">{image.caption}</p>
                    ) : (
                      <p className="text-sm text-daet-ink/70 italic mb-2">No caption</p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-1 flex-wrap">
                      {canReorder && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleReorder("up", index)}
                            disabled={index === 0 || loading}
                            className="flex-1 px-2 py-1 text-xs bg-muted-strong text-daet-ink/80 rounded-2xl hover:bg-line transition disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReorder("down", index)}
                            disabled={index === sortedImages.length - 1 || loading}
                            className="flex-1 px-2 py-1 text-xs bg-muted-strong text-daet-ink/80 rounded-2xl hover:bg-line transition disabled:opacity-50 disabled:cursor-not-allowed"
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
                          className="flex-1 px-2 py-1 text-xs bg-blue-200 dark:bg-blue-800/60 text-daet-leaf dark:text-blue-300 rounded-2xl hover:bg-blue-300 dark:hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Caption
                        </button>
                      )}
                      {canRemoveImages && (
                        <button
                          type="button"
                          onClick={async () => {
                        if (await confirm({ title: "Delete this image?", confirmLabel: "Delete" })) {
                              handleDeleteImage(image.id, image.imageUrl);
                            }
                          }}
                          disabled={loading || deletingId === image.id}
                          className="flex-1 px-2 py-1 text-xs bg-red-200 dark:bg-red-800/60 text-red-700 dark:text-red-300 rounded-2xl hover:bg-red-300 dark:hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="text-center py-12 text-daet-ink/70">
          <svg className="w-12 h-12 mx-auto mb-3 text-daet-ink/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-sm font-medium">No gallery images yet</p>
          <p className="text-xs mt-1">
            {canAddImages
              ? "Upload or drag photos here to showcase your package"
              : "Upload images to showcase your package"}
          </p>
        </div>
      )}

      {/* Validation Errors */}
      {Object.keys(galleryErrors).length > 0 && (
        <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/40 rounded-2xl text-sm text-red-800 dark:text-red-300">
          <p className="font-medium">Gallery errors:</p>
          <ul className="mt-1 space-y-1">
            {Object.entries(galleryErrors).map(([key, message]) => (
              <li key={key}>• {message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Help text */}
      <div className="mt-4 text-xs text-daet-ink/80 space-y-1 p-3 bg-canvas rounded-2xl">
        <p>Supported formats: {ALLOWED_IMAGE_EXTENSIONS.join(", ")}</p>
        <p>Maximum file size: {EDIT_LIMITS.imageBytes / (1024 * 1024)}MB</p>
        <p>Maximum {EDIT_LIMITS.maxGalleryImages} images per package</p>
      </div>

      {!canAddImages && (
        <div className="mt-4 p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-sm text-blue-900 dark:text-blue-300">
          Gallery images cannot be modified for this package status.
        </div>
      )}

      {packageStatus === "published" && canAddImages && (
        <div className="mt-4 p-3 rounded-2xl bg-yellow-50 dark:bg-yellow-950/40 text-sm text-yellow-900 dark:text-yellow-200">
          Adding, removing or reordering photos sends this package back to the Tourism Office for review. Until
          they approve it, the package is hidden from tourists. Caption edits stay live.
        </div>
      )}
    </div>
  );
}
