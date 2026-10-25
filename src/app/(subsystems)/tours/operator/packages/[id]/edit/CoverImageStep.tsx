"use client";

import React, { useCallback, useState } from "react";
import Image from "next/image";
import type { EditPackageStatus, ValidationErrors } from "./edit-types";
import { uploadPackageImage } from "./actions";
import { EDIT_LIMITS, ALLOWED_IMAGE_EXTENSIONS, ALLOWED_IMAGE_TYPES } from "./edit-constants";
import { getEditPermissions } from "./permissions";

interface CoverImageStepData {
  coverImageUrl: string | null;
}

interface CoverImageStepProps {
  packageId: string;
  data: CoverImageStepData;
  originalData: CoverImageStepData;
  packageStatus: EditPackageStatus;
  onUpdate: (data: CoverImageStepData) => void;
  errors: ValidationErrors;
  loading: boolean;
}

/**
 * CoverImageStep Component
 *
 * Handles cover image upload and preview with:
 * - File validation (format and size)
 * - Image preview
 * - Upload progress indication
 * - Error handling
 */
export function CoverImageStep({
  packageId,
  data,
  originalData,
  packageStatus,
  onUpdate,
  errors,
  loading,
}: CoverImageStepProps) {
  const permissions = getEditPermissions(packageStatus);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const isReadOnly = !permissions.canEdit || !permissions.coverImage;

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

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const validationError = validateImage(file);
      if (validationError) {
        setUploadError(validationError);
        setUploadProgress(0);
        return;
      }

      setUploadLoading(true);
      setUploadError(null);
      setUploadProgress(10);

      try {
        const formData = new FormData();
        formData.append("file", file);

        setUploadProgress(50);
        const result = await uploadPackageImage(packageId, formData);

        if (result.success && result.imageUrl) {
          setUploadProgress(100);
          onUpdate({
            ...data,
            coverImageUrl: result.imageUrl,
          });

          // Reset after success
          setTimeout(() => {
            setUploadProgress(0);
            setUploadLoading(false);
          }, 500);
        } else {
          setUploadError(result.error?.message ?? "Failed to upload image");
          setUploadProgress(0);
          setUploadLoading(false);
        }
      } catch (error) {
        setUploadError("An error occurred during upload");
        setUploadProgress(0);
        setUploadLoading(false);
      }

      // Reset file input
      event.target.value = "";
    },
    [data, onUpdate, packageId]
  );

  return (
    <div className="border rounded-xl p-6 bg-white">
      <h2 className="text-xl font-bold text-daet-ink mb-6">Cover Image</h2>

      <div className="space-y-4">
        {/* Current Image Preview */}
        {data.coverImageUrl ? (
          <div className="relative w-full h-64 rounded-xl overflow-hidden bg-slate-100 border border-daet-ink/20">
            <Image
              src={data.coverImageUrl}
              alt="Cover image preview"
              fill
              className="object-cover"
              onError={() => {
                setUploadError("Failed to load image preview");
              }}
            />
          </div>
        ) : (
          <div className="w-full h-64 rounded-xl bg-slate-100 border-2 border-dashed border-daet-ink/20 flex items-center justify-center">
            <div className="text-center">
              <svg className="w-12 h-12 text-daet-ink/70 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-daet-ink/80 text-sm font-medium">No cover image</p>
            </div>
          </div>
        )}

        {/* Upload Progress */}
        {uploadLoading && uploadProgress > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-daet-ink/80">Uploading...</span>
              <span className="text-daet-ink/70">{uploadProgress}%</span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-daet-forest transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}

        {/* Upload Error */}
        {uploadError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800 flex items-start gap-2">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span>{uploadError}</span>
          </div>
        )}

        {/* Upload Button */}
        <div className="flex gap-2">
          <label htmlFor="cover-image-input" className="cursor-pointer">
            <div
              className={`px-4 py-2 rounded-xl font-medium transition text-center ${
                isReadOnly || uploadLoading || loading
                  ? "bg-slate-100 text-daet-ink/70 cursor-not-allowed"
                  : "bg-daet-forest text-white hover:bg-daet-leaf"
              }`}
            >
              {uploadLoading ? "Uploading..." : data.coverImageUrl ? "Upload New Image" : "Upload Image"}
            </div>
            <input
              id="cover-image-input"
              type="file"
              accept={ALLOWED_IMAGE_TYPES.join(",")}
              onChange={handleFileChange}
              disabled={isReadOnly || uploadLoading || loading}
              className="hidden"
            />
          </label>

          {data.coverImageUrl && !isReadOnly && (
            <button
              type="button"
              onClick={() =>
                onUpdate({
                  ...data,
                  coverImageUrl: null,
                })
              }
              disabled={uploadLoading || loading}
              className="px-4 py-2 border border-red-300 text-rose-700 rounded-xl font-medium hover:bg-red-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Remove Image
            </button>
          )}
        </div>

        {/* Help text */}
        <div className="text-xs text-daet-ink/80 space-y-1">
          <p>Supported formats: {ALLOWED_IMAGE_EXTENSIONS.join(", ")}</p>
          <p>Maximum file size: {EDIT_LIMITS.imageBytes / (1024 * 1024)}MB</p>
          <p>Recommended dimensions: 1200x600px</p>
        </div>

        {/* Read-only indicator */}
        {isReadOnly && (
          <div className="p-3 bg-daet-sand border border-blue-200 rounded text-sm text-daet-leaf">
            ℹ️ Cover image cannot be changed for this package status.
          </div>
        )}
      </div>
    </div>
  );
}
