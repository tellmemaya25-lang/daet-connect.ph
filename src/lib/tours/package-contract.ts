import "server-only";

/**
 * Column contract for package creation/editing, verified against the live
 * Supabase schema via information_schema and pg_constraint queries.
 *
 * ENFORCED BY DATABASE:
 * - tours_packages.operator_id -> tours_operators.id ON DELETE CASCADE
 * - tours_package_price_variants.package_id -> tours_packages.id ON DELETE CASCADE
 * - tours_package_stops.package_id -> tours_packages.id ON DELETE CASCADE
 * - price_variant_check: (price_per_pax IS NOT NULL) OR (flat_price IS NOT NULL)
 *   NOTE: this is OR, not XOR. Both can be set simultaneously; only both null
 *   is rejected. The client-safe validators mirror this rule.
 *
 * NOT ENFORCED BY DATABASE (handled via replace_package_price_variants /
 * replace_package_stops RPCs):
 * - Only one price variant per package should have is_default = true.
 * - stop_order is recomputed from array position server-side on every save;
 *   client-provided ordering is never trusted directly.
 *
 * STATUS WORKFLOW (operator-facing): draft -> pending_review via
 * submitPackageForReview. Admin-side transitions are out of scope here.
 */
export const PACKAGE_TABLE = "tours_packages";
export const PRICE_VARIANT_TABLE = "tours_package_price_variants";
export const STOP_TABLE = "tours_package_stops";

export type PackageStatus = "draft" | "pending_review" | "published" | "rejected" | "archived";
export type DurationType = "hours" | "days";

export const PACKAGE_STATUS = {
  DRAFT: "draft",
  PENDING_REVIEW: "pending_review",
  PUBLISHED: "published",
  REJECTED: "rejected",
  ARCHIVED: "archived",
} as const satisfies Record<string, PackageStatus>;

export const EDITABLE_PACKAGE_STATUSES: PackageStatus[] = ["draft"];

export const PACKAGE_FIELDS = {
  operatorId: "operator_id",
  title: "title",
  description: "description",
  locationName: "location_name",
  durationValue: "duration_value",
  durationType: "duration_type",
  inclusions: "inclusions",
  exclusions: "exclusions",
  coverImageUrl: "cover_image_url",
  galleryUrls: "gallery_urls",
  status: "status",
} as const;

export const PRICE_VARIANT_FIELDS = {
  packageId: "package_id",
  variantName: "variant_name",
  minPax: "min_pax",
  maxPax: "max_pax",
  pricePerPax: "price_per_pax",
  flatPrice: "flat_price",
  isDefault: "is_default",
} as const;

export const STOP_FIELDS = {
  packageId: "package_id",
  stopOrder: "stop_order",
  locationName: "location_name",
  latitude: "latitude",
  longitude: "longitude",
  description: "description",
  estimatedDurationMinutes: "estimated_duration_minutes",
} as const;

export const PACKAGE_LIST_SELECT =
  "id,title,status,cover_image_url,location_name,duration_value,duration_type,created_at,updated_at";

export const PACKAGE_DETAIL_SELECT =
  "id,operator_id,title,description,location_name,duration_value,duration_type," +
  "inclusions,exclusions,cover_image_url,gallery_urls,status,created_at,updated_at," +
  `${PRICE_VARIANT_TABLE}(*),${STOP_TABLE}(*)`;

export const PACKAGE_STORAGE_BUCKET =
  process.env.TOURS_PACKAGE_MEDIA_BUCKET ?? "tours-package-media";

export type { PackageStopInput, PriceVariantInput } from "./package-validation";
export { validatePackageStop, validatePriceVariant } from "./package-validation";

export interface PackageRecord {
  id: string;
  operator_id: string;
  title: string;
  description: string | null;
  location_name: string;
  duration_value: number;
  duration_type: DurationType;
  inclusions: string[] | null;
  exclusions: string[] | null;
  cover_image_url: string | null;
  gallery_urls: string[] | null;
  status: PackageStatus;
  created_at: string;
  updated_at: string;
}

export type PackageListRecord = Pick<
  PackageRecord,
  | "id"
  | "title"
  | "status"
  | "cover_image_url"
  | "location_name"
  | "duration_value"
  | "duration_type"
  | "created_at"
  | "updated_at"
>;

export interface PriceVariantRecord {
  id: string;
  package_id: string;
  variant_name: string;
  min_pax: number;
  max_pax: number | null;
  price_per_pax: number | null;
  flat_price: number | null;
  is_default: boolean;
  created_at: string;
}

export interface PackageStopRecord {
  id: string;
  package_id: string;
  stop_order: number;
  location_name: string;
  latitude: number;
  longitude: number;
  description: string | null;
  estimated_duration_minutes: number | null;
  created_at: string;
}

export interface PackageDetailRecord extends PackageRecord {
  tours_package_price_variants: PriceVariantRecord[];
  tours_package_stops: PackageStopRecord[];
}
