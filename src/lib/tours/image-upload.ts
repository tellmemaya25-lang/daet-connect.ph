/**
 * Image upload utilities for tour packages
 * Handles upload to Supabase Storage and URL generation
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';

const BUCKET_NAME = 'package-images';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export interface UploadImageResult {
  success: boolean;
  url?: string;
  path?: string;
  error?: string;
}

/**
 * Upload a single image to Supabase Storage
 * Images should be pre-compressed on the client side before upload
 */
export async function uploadPackageImage(
  file: File,
  packageId: string,
  imageType: 'cover' | 'gallery' | 'featured'
): Promise<UploadImageResult> {
  try {
    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return {
        success: false,
        error: 'Invalid file type. Only JPG, PNG, and WebP are allowed.',
      };
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: 'File size too large. Maximum size is 5MB.',
      };
    }

    // Use file directly without additional compression
    // (compression should be handled on client side before upload)
    
    // Generate unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(7);
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const filename = `${imageType}-${timestamp}-${randomStr}.${extension}`;
    const filepath = `packages/${packageId}/${filename}`;

    // Upload to Supabase Storage
    const supabase = await createSupabaseServerClient();
    
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filepath, file, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('Storage upload error:', error);
      return {
        success: false,
        error: `Upload failed: ${error.message}`,
      };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filepath);

    return {
      success: true,
      url: urlData.publicUrl,
      path: filepath,
    };
  } catch (error) {
    console.error('Image upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Delete an image from Supabase Storage
 */
export async function deletePackageImage(filepath: string): Promise<boolean> {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.storage.from(BUCKET_NAME).remove([filepath]);

    if (error) {
      console.error('Storage delete error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Image delete error:', error);
    return false;
  }
}

/**
 * Upload multiple images (for gallery)
 */
export async function uploadMultipleImages(
  files: File[],
  packageId: string
): Promise<UploadImageResult[]> {
  const results = await Promise.all(
    files.map((file) => uploadPackageImage(file, packageId, 'gallery'))
  );

  return results;
}

/**
 * Extract storage path from public URL
 */
export function extractStoragePath(publicUrl: string): string | null {
  try {
    const url = new URL(publicUrl);
    const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/package-images\/(.+)$/);
    return pathMatch ? pathMatch[1] : null;
  } catch {
    return null;
  }
}
