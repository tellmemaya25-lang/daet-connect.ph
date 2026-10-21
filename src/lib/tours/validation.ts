/**
 * Image Validation Utilities
 * 
 * Provides utilities for validating image files including:
 * - Format validation (jpg, jpeg, png, webp)
 * - File size validation (max 5MB)
 * - MIME type checking
 * - Human-readable file size formatting
 */

// Maximum file size: 5MB
export const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes

// Allowed image MIME types
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

// Allowed image extensions
export const ALLOWED_IMAGE_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'webp',
] as const;

/**
 * Checks if a MIME type is allowed for images
 * 
 * @param mimeType - The MIME type to validate (e.g., 'image/jpeg')
 * @returns true if the MIME type is in the allowed list, false otherwise
 * 
 * @example
 * isValidImageMimeType('image/jpeg') // true
 * isValidImageMimeType('image/gif') // false
 * isValidImageMimeType('text/plain') // false
 */
export function isValidImageMimeType(mimeType: string | null | undefined): boolean {
  if (!mimeType || typeof mimeType !== 'string') {
    return false;
  }

  const normalizedMimeType = mimeType.toLowerCase().trim();
  return ALLOWED_IMAGE_MIME_TYPES.includes(normalizedMimeType as typeof ALLOWED_IMAGE_MIME_TYPES[number]);
}

/**
 * Validates an image file for format and size
 * 
 * Performs the following checks:
 * - File must not be empty
 * - File size must not exceed 5MB
 * - MIME type must be one of: jpeg, png, webp
 * 
 * @param file - The File object to validate
 * @returns Object with validation result
 *   - { valid: true } if all checks pass
 *   - { valid: false, error: string } if any check fails with a user-friendly error message
 * 
 * @example
 * const file = new File(['content'], 'image.jpg', { type: 'image/jpeg' });
 * const result = validateImageFile(file);
 * if (result.valid) {
 *   // File is valid, proceed with upload
 * } else {
 *   // Show error message to user
 *   console.error(result.error);
 * }
 */
export function validateImageFile(file: File | null | undefined): { valid: true } | { valid: false; error: string } {
  // Check if file exists
  if (!file || !(file instanceof File)) {
    return { valid: false, error: 'Please select a file' };
  }

  // Check if file is empty
  if (file.size === 0) {
    return { valid: false, error: 'File is empty. Please select a non-empty image file' };
  }

  // Check file size
  if (file.size > MAX_IMAGE_FILE_SIZE) {
    return {
      valid: false,
      error: `File is too large. Maximum size is ${formatFileSize(MAX_IMAGE_FILE_SIZE)}. Your file is ${formatFileSize(file.size)}`,
    };
  }

  // Check MIME type
  if (!isValidImageMimeType(file.type)) {
    return {
      valid: false,
      error: `File format not supported. Please use JPG, PNG, or WebP. Your file is ${file.type || 'unknown type'}`,
    };
  }

  return { valid: true };
}

/**
 * Formats bytes into a human-readable file size string
 * 
 * Converts bytes to the appropriate unit (B, KB, MB, GB) with up to 2 decimal places.
 * 
 * @param bytes - The number of bytes to format
 * @returns Human-readable size string (e.g., "2.5 MB", "512 KB", "1.2 GB")
 * 
 * @example
 * formatFileSize(1024) // "1 KB"
 * formatFileSize(1536) // "1.5 KB"
 * formatFileSize(5242880) // "5 MB"
 * formatFileSize(1073741824) // "1 GB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  const unitSize = 1024;
  const unitIndex = Math.floor(Math.log(bytes) / Math.log(unitSize));

  if (unitIndex >= units.length) {
    return `${(bytes / Math.pow(unitSize, units.length - 1)).toFixed(2)} ${units[units.length - 1]}`;
  }

  const size = bytes / Math.pow(unitSize, unitIndex);
  const rounded = Math.round(size * 100) / 100; // Round to 2 decimal places

  return `${rounded} ${units[unitIndex]}`;
}

// Re-export validation functions from package-validation.ts for convenient centralized access
export {
  validatePackageFormData,
  validatePriceVariant,
  validatePackageStop,
  type ValidationResult,
  type BasicPackageInfo,
  type PriceVariantInput,
  type PackageStopInput,
} from '@/lib/tours/package-validation';
