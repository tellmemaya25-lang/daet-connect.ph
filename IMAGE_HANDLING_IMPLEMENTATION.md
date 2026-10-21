# Image Handling Server Actions Implementation

This document describes the implementation of two image handling server actions for the operator edit package feature:
- **Task 2.13**: `uploadPackageImage` - Upload images to Supabase storage
- **Task 2.14**: `deletePackageImage` - Delete images from Supabase storage

## Overview

Both actions are implemented in `src/app/(subsystems)/tours/operator/packages/[id]/edit/actions.ts` with full validation, error handling, and proper permission checks.

## Task 2.13: uploadPackageImage

### Signature
```typescript
export async function uploadPackageImage(
  packageId: string,
  formData: FormData,
): Promise<{ success: boolean; imageUrl?: string; error?: { message: string } }>
```

### Purpose
Upload an image file to Supabase storage for a package, with comprehensive validation and permission checks.

### Requirements Met
- **4.3-4.6**: Image upload with format and size validation
- **8.2-8.4**: Gallery image upload validation

### Flow

1. **Authentication Verification**
   - Create Supabase server client
   - Call `requireAuthenticated()` to verify user is authenticated and has operator role
   - Return 401 if not authenticated, 403 if not approved operator

2. **Package ID Validation**
   - Validate packageId is a valid UUID format
   - Return 400 if invalid

3. **File Extraction & Validation**
   - Extract file from FormData
   - Return 400 if no file provided
   - Validate file MIME type (jpg, jpeg, png, webp only)
   - Return 400 if invalid format
   - Validate file size (max 5MB)
   - Return 400 if too large

4. **Storage Path Generation**
   - Generate unique imageId using `crypto.randomUUID()`
   - Extract file extension from file name
   - Create storage path: `tours-package-media/{operatorId}/{packageId}/{imageId}.{ext}`

5. **Upload & URL Generation**
   - Upload file to Supabase storage bucket `PACKAGE_STORAGE_BUCKET`
   - Generate public URL using Supabase storage
   - Return success with imageUrl

### Validation Rules

| Aspect | Rule | Error Message |
|--------|------|---------------|
| **Format** | jpg, jpeg, png, webp only | "Invalid file format. Only JPG, PNG, and WebP are allowed." |
| **Size** | Max 5MB (5,242,880 bytes) | "File size too large. Maximum size is 5MB." |
| **Authentication** | Must be authenticated operator | "Authentication required. Please log in." / "Access denied: operator role required" |

### Error Handling

| Status | Scenario | Message |
|--------|----------|---------|
| 401 | User not authenticated | "Authentication required. Please log in." |
| 403 | User is not approved operator | "Access denied: operator role required" |
| 400 | Invalid file format | "Invalid file format. Only JPG, PNG, and WebP are allowed." |
| 400 | File too large | "File size too large. Maximum size is 5MB." |
| 400 | No file provided | "No file provided." |
| 400 | Invalid package ID | "Invalid package ID." |
| 500 | Upload fails | "Failed to upload image. Please try again." |
| 500 | Unexpected error | "An error occurred while uploading the image." |

### Storage Path Structure

```
tours-package-media/
├── {operatorId}/                    # UUID of the operator
│   └── {packageId}/                 # UUID of the package
│       ├── {imageId-1}.jpg          # UUID-based unique filename
│       ├── {imageId-2}.png
│       └── {imageId-n}.webp
```

### Example Usage

```typescript
// From a client component
const formData = new FormData();
formData.append("file", imageFile);

const result = await uploadPackageImage(packageId, formData);
if (result.success) {
  // Use result.imageUrl in gallery
  addImageToGallery(result.imageUrl);
} else {
  // Show error: result.error.message
  showError(result.error.message);
}
```

### Implementation Details

- **UUID Generation**: Uses native `crypto.randomUUID()` for unique image IDs
- **File Extension**: Extracted from original file name, defaults to 'jpg' if missing
- **MIME Type Validation**: Checks actual MIME type, not just extension
- **Supabase Integration**: Uses server client for secure uploads
- **Cache Control**: Sets 3600 second (1 hour) cache on uploaded files

---

## Task 2.14: deletePackageImage

### Signature
```typescript
export async function deletePackageImage(
  packageId: string,
  imageUrl: string,
): Promise<{ success: boolean; message?: string; error?: { message: string } }>
```

### Purpose
Delete an image from Supabase storage with strict ownership and status checks.

### Requirements Met
- **8.7**: Delete gallery images with proper restrictions

### Flow

1. **Authentication & Ownership Verification**
   - Create Supabase server client
   - Call `requireAuthenticated()` to verify session
   - Call `requirePackageOwnership()` to verify operator owns package
   - Return 401/403/404 with appropriate error

2. **Package ID Validation**
   - Validate packageId is a valid UUID format
   - Return 400 if invalid

3. **Status Verification**
   - Load package status from database
   - Check if status is "draft" (only draft packages allow deletion)
   - Return 403 if not draft status

4. **Storage Path Extraction**
   - Parse imageUrl to extract storage path
   - Try URL parsing first with regex match
   - Fall back to string splitting if URL parsing fails
   - Return 400 if path cannot be extracted

5. **Deletion & Confirmation**
   - Delete file from Supabase storage using extracted path
   - Return success with confirmation message

### Validation Rules

| Aspect | Rule | Error Message |
|--------|------|---------------|
| **Package Status** | Must be "draft" | "Images can only be deleted from draft packages. Published or pending review packages are locked." |
| **Ownership** | Operator must own package | "Access denied: you do not own this package" |
| **Authentication** | Must be authenticated | "Authentication required. Please log in." / "Access denied: operator role required" |
| **URL Format** | Valid storage URL | "Invalid image URL format." |

### Error Handling

| Status | Scenario | Message |
|--------|----------|---------|
| 401 | User not authenticated | "Authentication required. Please log in." |
| 403 | User is not operator | "Access denied: operator role required" |
| 403 | Not package owner | "Access denied: you do not own this package" |
| 403 | Package not in draft | "Images can only be deleted from draft packages..." |
| 404 | Package not found | "Package not found." |
| 400 | Invalid package ID | "Invalid package ID." |
| 400 | Invalid URL format | "Invalid image URL format." |
| 500 | Delete fails | "Failed to delete image. Please try again." |
| 500 | Unexpected error | "An error occurred while deleting the image." |

### Status-Based Access Control

```
Status         | Can Delete Images
----------------|------------------
draft          | ✅ YES
rejected       | ❌ NO (locked)
published      | ❌ NO (locked)
pending_review | ❌ NO (locked)
archived       | ❌ NO (locked)
```

### Storage Path Extraction

Supports multiple URL formats:

1. **Standard Supabase URL**
   ```
   https://<project>.supabase.co/storage/v1/object/public/tours-package-media/opId/pkgId/imgId.jpg
   ```

2. **Direct path extraction**
   ```
   tours-package-media/opId/pkgId/imgId.jpg
   ```

The implementation uses regex to parse standard URLs and falls back to string splitting for edge cases.

### Example Usage

```typescript
// From a client component with confirmation
if (confirm("Delete this image?")) {
  const result = await deletePackageImage(packageId, imageUrl);
  if (result.success) {
    // Remove from gallery UI
    removeImageFromGallery(imageUrl);
    // Show success message
    showSuccess(result.message);
  } else {
    // Show error
    showError(result.error.message);
  }
}
```

### Implementation Details

- **Status Check**: Enforces draft-only restriction for deletion
- **Ownership Verification**: Double-checks operator ownership before deletion
- **URL Parsing**: Handles both standard Supabase URLs and fallback formats
- **Error Recovery**: Uses try-catch for graceful handling of unexpected errors
- **Logging**: Logs errors to console for debugging

---

## Error Response Format

Both actions return consistent error format:

```typescript
{
  success: false,
  error: {
    message: "User-friendly error message"
  }
}
```

Success responses:

```typescript
// uploadPackageImage
{
  success: true,
  imageUrl: "https://..."
}

// deletePackageImage
{
  success: true,
  message: "Image deleted successfully."
}
```

---

## Integration with Package Status Workflow

### Upload Restrictions
- ✅ **draft**: Unrestricted upload
- ✅ **rejected**: Unrestricted upload (can fix before resubmit)
- ❌ **published**: No upload (gallery is locked)
- ❌ **pending_review**: No upload (locked while under review)
- ❌ **archived**: No upload (archived packages are immutable)

### Delete Restrictions
- ✅ **draft**: Allowed (can make changes)
- ❌ **rejected**: Not allowed (would prevent resubmit with changes)
- ❌ **published**: Not allowed (gallery is locked)
- ❌ **pending_review**: Not allowed (locked while under review)
- ❌ **archived**: Not allowed (archived packages are immutable)

> **Note**: The current implementation only allows deletion from draft packages. To support deletion from rejected packages before resubmit, update the status check to: `status !== "draft" && status !== "rejected"`

---

## Testing

Comprehensive test suite included in `image-actions.test.ts`:

### uploadPackageImage Tests
- ✅ Successful upload with URL return
- ✅ File format validation (jpg, jpeg, png, webp)
- ✅ File size validation (max 5MB)
- ✅ Authentication checks (401)
- ✅ Operator approval checks (403)
- ✅ UUID generation for imageId
- ✅ Storage path structure validation
- ✅ No file provided error handling

### deletePackageImage Tests
- ✅ Successful deletion from draft package
- ✅ Package ownership verification
- ✅ Draft-only status restriction
- ✅ Storage path extraction from URL
- ✅ Authentication checks (401)
- ✅ Package not found (404)
- ✅ Storage deletion error handling

### Running Tests
```bash
npm test -- image-actions.test.ts
```

---

## Security Considerations

1. **Authentication**: Both actions verify user is authenticated and has operator role
2. **Authorization**: deletePackageImage verifies package ownership
3. **File Type Validation**: MIME type checked (not just extension)
4. **File Size Limit**: 5MB maximum enforces reasonable limits
5. **Status-Based Access**: Draft-only deletion prevents accidental modifications
6. **Path Isolation**: Images organized by operatorId and packageId for separation
7. **UUID Filenames**: Unique IDs prevent name collisions and path traversal

---

## Performance Notes

- **Upload**: File is streamed directly to Supabase storage (no local buffering)
- **Deletion**: Direct removal from storage without database updates
- **Path Extraction**: Regex-based parsing is negligible compared to network latency
- **Concurrent Uploads**: Multiple images can be uploaded in parallel via Promise.all()

---

## Future Enhancements

1. **Image Compression**: Client-side compression before upload
2. **Thumbnail Generation**: Server-side thumbnail creation on upload
3. **Deletion from Rejected**: Allow deletion from rejected packages too
4. **Batch Operations**: Delete multiple images in one call
5. **Image Metadata**: Store and retrieve image dimensions, size, etc.
6. **CDN Integration**: Route through CDN for faster delivery

---

## Related Documentation

- **Package Contract**: `src/lib/tours/package-contract.ts`
- **Server Auth**: `src/lib/tours/server-auth.ts`
- **Supabase Client**: `src/lib/supabase/server.ts`
- **Edit Permissions**: `src/app/(subsystems)/tours/operator/packages/[id]/edit/permissions.ts`
