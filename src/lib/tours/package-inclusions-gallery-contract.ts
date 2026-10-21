import "server-only";

/**
 * Column contract for package inclusions and gallery tables,
 * verified against the live Supabase schema.
 *
 * ENFORCED BY DATABASE:
 * - tours_package_inclusions.package_id -> tours_packages.id ON DELETE CASCADE
 * - tours_package_gallery.package_id -> tours_packages.id ON DELETE CASCADE
 * - UNIQUE(package_id, display_order) on both tables
 * - tours_package_gallery has CHECK constraint: max 20 images per package
 *
 * HANDLED BY CLIENT/APPLICATION:
 * - display_order recomputation on reorder
 * - Validation of item_text and caption length
 */

export const INCLUSIONS_TABLE = "tours_package_inclusions";
export const GALLERY_TABLE = "tours_package_gallery";

export const INCLUSIONS_FIELDS = {
  id: "id",
  packageId: "package_id",
  itemText: "item_text",
  isIncluded: "is_included",
  displayOrder: "display_order",
  createdAt: "created_at",
} as const;

export const GALLERY_FIELDS = {
  id: "id",
  packageId: "package_id",
  imageUrl: "image_url",
  caption: "caption",
  displayOrder: "display_order",
  createdAt: "created_at",
} as const;

/**
 * Database record types
 */
export interface PackageInclusionRecord {
  id: string;
  package_id: string;
  item_text: string;
  is_included: boolean;
  display_order: number;
  created_at: string;
}

export interface PackageGalleryRecord {
  id: string;
  package_id: string;
  image_url: string;
  caption: string | null;
  display_order: number;
  created_at: string;
}

/**
 * Input types for creating/updating records
 */
export interface PackageInclusionInput {
  item_text: string;
  is_included: boolean;
  display_order: number;
}

export interface PackageGalleryInput {
  image_url: string;
  caption?: string | null;
  display_order: number;
}

/**
 * Validation constraints
 */
export const INCLUSION_CONSTRAINTS = {
  MIN_ITEM_LENGTH: 1,
  MAX_ITEM_LENGTH: 500,
  MAX_ITEMS_PER_PACKAGE: 50,
} as const;

export const GALLERY_CONSTRAINTS = {
  MAX_CAPTION_LENGTH: 500,
  MAX_IMAGES_PER_PACKAGE: 20,
  MIN_IMAGES_PER_PACKAGE: 0,
} as const;
