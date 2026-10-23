# Image Upload System - Setup Guide

## Overview
Complete image upload system for tour packages with Supabase Storage, client-side compression, drag & drop, and image management.

## Files Created

### Database Migration
- `supabase/migrations/create_package_images_storage.sql` - Storage bucket and policies

### Utility Functions
- `src/lib/tours/image-upload.ts` - Server-side upload/delete functions
- `src/lib/tours/compress-image.ts` - Already exists (image compression)

### React Components
- `src/components/tours/image-uploader.tsx` - Drag & drop upload component
- `src/components/tours/image-preview.tsx` - Image grid with delete/reorder

## Setup Steps

### 1. Apply Database Migration

Run in Supabase SQL Editor:
```sql
-- Copy entire content from: supabase/migrations/create_package_images_storage.sql
```

This creates:
- ✅ `package-images` storage bucket (public)
- ✅ Storage policies (upload, view, update, delete)
- ✅ `cover_image_url` column in tours_packages
- ✅ `featured_image_url` column in tours_packages

### 2. Verify Storage Bucket

In Supabase Dashboard → Storage:
- Bucket `package-images` should exist
- Public access: enabled
- File path structure: `packages/{package-id}/{filename}`

### 3. Update Package Creation Form

Add image upload to the package creation form:

```typescript
// In src/app/(subsystems)/tours/operator/packages/create/package-create-form.tsx

import { ImageUploader } from '@/components/tours/image-uploader';
import { ImagePreview } from '@/components/tours/image-preview';

// Add state
const [coverImage, setCoverImage] = useState<File | null>(null);
const [galleryImages, setGalleryImages] = useState<File[]>([]);

// Add upload handlers
const handleCoverUpload = (files: File[]) => {
  if (files.length > 0) {
    setCoverImage(files[0]);
  }
};

const handleGalleryUpload = (files: File[]) => {
  setGalleryImages((prev) => [...prev, ...files].slice(0, 10));
};

const handleDeleteGallery = (index: number) => {
  setGalleryImages((prev) => prev.filter((_, i) => i !== index));
};

// Add to form JSX (after inclusions section)
<div className="space-y-6">
  <h3 className="text-lg font-semibold">Images</h3>
  
  {/* Cover Image */}
  <ImageUploader
    onUpload={handleCoverUpload}
    maxFiles={1}
    multiple={false}
    label="Cover Image"
    description="Main package image (1200x800px recommended)"
  />
  
  {coverImage && (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
      <img
        src={URL.createObjectURL(coverImage)}
        alt="Cover preview"
        className="w-20 h-20 object-cover rounded"
      />
      <div className="flex-1">
        <p className="text-sm font-medium">{coverImage.name}</p>
        <p className="text-xs text-gray-500">
          {(coverImage.size / 1024 / 1024).toFixed(2)} MB
        </p>
      </div>
      <button
        type="button"
        onClick={() => setCoverImage(null)}
        className="text-red-600 hover:text-red-700"
      >
        Remove
      </button>
    </div>
  )}

  {/* Gallery Images */}
  <ImageUploader
    onUpload={handleGalleryUpload}
    maxFiles={10}
    multiple={true}
    label="Gallery Images"
    description="Additional package photos (up to 10 images)"
  />

  {galleryImages.length > 0 && (
    <ImagePreview
      images={galleryImages.map((file) => ({
        url: URL.createObjectURL(file),
      }))}
      onDelete={handleDeleteGallery}
      editable={true}
    />
  )}
</div>
```

### 4. Update Server Action

Modify `src/app/(subsystems)/tours/operator/packages/create/actions.ts`:

```typescript
import { uploadPackageImage } from '@/lib/tours/image-upload';

export async function createPackage(formData: FormData) {
  // ... existing package creation code ...

  // After package is created, upload images
  const coverImageFile = formData.get('coverImage') as File | null;
  const galleryFiles = formData.getAll('galleryImages') as File[];

  if (coverImageFile && packageId) {
    const result = await uploadPackageImage(coverImageFile, packageId, 'cover');
    
    if (result.success && result.url) {
      // Update package with cover image URL
      await supabase
        .from('tours_packages')
        .update({ cover_image_url: result.url })
        .eq('id', packageId);
    }
  }

  // Upload gallery images
  if (galleryFiles.length > 0 && packageId) {
    for (const file of galleryFiles) {
      const result = await uploadPackageImage(file, packageId, 'gallery');
      
      if (result.success && result.url) {
        // Insert into tours_package_gallery
        await supabase
          .from('tours_package_gallery')
          .insert({
            package_id: packageId,
            image_url: result.url,
            display_order: galleryFiles.indexOf(file),
          });
      }
    }
  }

  return { success: true, packageId };
}
```

## Features

### Image Compression
- ✅ Automatic compression before upload
- ✅ Cover image: max 1200x800px
- ✅ Gallery images: max 1920x1080px
- ✅ Quality: 85%
- ✅ Reduces file size significantly

### Storage
- ✅ Supabase Storage bucket
- ✅ Public read access
- ✅ Authenticated upload/delete
- ✅ CDN-enabled URLs
- ✅ File path: `packages/{package-id}/{filename}`

### UI Components
- ✅ Drag & drop upload
- ✅ Click to browse
- ✅ Image preview grid
- ✅ Delete button per image
- ✅ Drag to reorder (gallery)
- ✅ File size display
- ✅ Upload progress indicators

### Validation
- ✅ File type: JPG, PNG, WebP only
- ✅ File size: Max 5MB per image
- ✅ Max files: Configurable (default 5-10)
- ✅ Client-side validation
- ✅ Server-side validation

## Usage Examples

### Single Image Upload (Cover)
```tsx
<ImageUploader
  onUpload={(files) => setCoverImage(files[0])}
  maxFiles={1}
  multiple={false}
  label="Cover Image"
/>
```

### Multiple Images (Gallery)
```tsx
<ImageUploader
  onUpload={(files) => setGalleryImages(prev => [...prev, ...files])}
  maxFiles={10}
  multiple={true}
  label="Gallery"
/>

<ImagePreview
  images={galleryImages.map(f => ({ url: URL.createObjectURL(f) }))}
  onDelete={(i) => setGalleryImages(prev => prev.filter((_, idx) => idx !== i))}
/>
```

### Server-Side Upload
```typescript
import { uploadPackageImage } from '@/lib/tours/image-upload';

const result = await uploadPackageImage(file, packageId, 'cover');

if (result.success) {
  console.log('Uploaded to:', result.url);
  console.log('Storage path:', result.path);
}
```

### Delete Image
```typescript
import { deletePackageImage, extractStoragePath } from '@/lib/tours/image-upload';

const path = extractStoragePath(imageUrl);
if (path) {
  const deleted = await deletePackageImage(path);
}
```

## Testing Checklist

### Storage Setup
- [ ] Bucket `package-images` exists in Supabase
- [ ] Bucket is public
- [ ] Storage policies applied

### Upload Functionality
- [ ] Can drag & drop images
- [ ] Can click to browse
- [ ] Multiple files upload works
- [ ] Images compress before upload
- [ ] Upload progress shows
- [ ] Success message displays

### Image Management
- [ ] Images preview correctly
- [ ] Can delete uploaded images
- [ ] Can reorder gallery images
- [ ] Cover image displays in package detail
- [ ] Gallery images display in package detail

### Validation
- [ ] Only image files accepted
- [ ] File size limit enforced (5MB)
- [ ] Max file count enforced
- [ ] Error messages display

## File Size Guide

| Image Type | Recommended Size | Max Dimensions |
|-----------|------------------|----------------|
| Cover Image | 1200x800px | 1200x800px |
| Gallery Images | 1920x1080px | 1920x1080px |
| Thumbnails | 400x300px | Auto-generated |

## Storage Structure

```
package-images/
└── packages/
    └── {package-id}/
        ├── cover-1234567890-abc123.jpg
        ├── gallery-1234567891-def456.jpg
        ├── gallery-1234567892-ghi789.jpg
        └── featured-1234567893-jkl012.jpg
```

## Next Steps

After image upload is working:
1. Add image editing (crop, rotate)
2. Add image captions
3. Add automatic thumbnail generation
4. Add image optimization on server
5. Add image lazy loading
6. Add image lightbox/modal view

## Troubleshooting

### Images not uploading
- Check Supabase Storage bucket exists
- Verify RLS policies applied
- Check browser console for errors
- Verify file size < 5MB

### Images not displaying
- Check public URL is accessible
- Verify bucket is public
- Check image URL format
- Verify tours_package_gallery has entries

### Compression too slow
- Reduce max dimensions
- Increase quality setting
- Use Web Workers (advanced)
- Show upload progress indicator

### Storage quota exceeded
- Clean up old/unused images
- Implement image lifecycle management
- Set up automatic deletion
- Upgrade Supabase plan
