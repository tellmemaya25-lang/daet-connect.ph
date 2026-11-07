"use server";

/**
 * Server actions behind the five-step create wizard.
 *
 * The wizard saves the operator's draft after every step, so leaving partway
 * through keeps the work. Two rules hold this together:
 *
 *  1. The browser never says who it is. The operator is resolved from the
 *     verified session, and the package must belong to that operator before
 *     anything is written.
 *  2. The browser is never trusted about content either. The payload is
 *     rebuilt field by field (`draft-payload.ts`) and validated with the
 *     editor's own rules (`draft-validation.ts`) before a single row is
 *     touched — a draft save checks the values that are present, and
 *     "submit for review" applies the full rules and then the database
 *     guard (`submit_package_for_review`) has the final say.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedSession } from "@/lib/tours/server-auth";
import { OPERATOR_TABLE, OPERATOR_USER_ID_COLUMN } from "@/lib/tours/operator-contract";
import { parseDraftPayload } from "./draft-payload";
import { validateDraft, type SavePackageDraftResult } from "./draft-validation";
import type { EditPackageFormData } from "../[id]/edit/edit-types";

const PACKAGE_TABLE = "tours_packages";
/** A draft may only be saved while the Tourism Office is not holding it. */
const EDITABLE_STATUSES = ["draft", "rejected"] as const;

export interface SavePackageDraftInput {
  /** Null on the very first step: the action creates the draft. */
  packageId?: string | null;
  draft: unknown;
  /** True for the review step's "Submit for review". */
  submitForReview?: boolean;
}

type OperatorContext = { operatorId: string } | { error: string };

/** The signed-in, approved operator — or a plain-language reason why not. */
async function requireOperator(): Promise<OperatorContext> {
  const session = await getVerifiedSession();
  if (!session.user) return { error: "Your session has ended. Sign in again to keep working." };
  if (session.error) return { error: session.error };
  if (session.role !== "operator") {
    return { error: "Only approved tour operators can create packages." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: operator, error } = await supabase
    .from(OPERATOR_TABLE)
    .select("id,accreditation_status")
    .eq(OPERATOR_USER_ID_COLUMN, session.user.id)
    .maybeSingle();

  if (error || !operator) return { error: "Your operator account could not be found." };
  if (operator.accreditation_status !== "approved") {
    return { error: "Your operator account must be approved before you can create packages." };
  }

  return { operatorId: operator.id as string };
}

const CHILD_WRITE_ERROR = "Your draft was saved, but its details could not be updated. Try again.";

/**
 * Replaces a package's child lists (price options, inclusions, stops, photos).
 * Draft packages have no bookings, so rewriting them is safe and idempotent —
 * each save describes the whole package, not a delta.
 */
async function replaceChildren(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  packageId: string,
  draft: EditPackageFormData,
): Promise<string | null> {
  const writers: Array<() => Promise<string | null>> = [
    async () => {
      const table = "tours_package_price_variants";
      const cleared = await supabase.from(table).delete().eq("package_id", packageId);
      if (cleared.error) return CHILD_WRITE_ERROR;
      if (draft.priceVariants.length === 0) return null;
      const written = await supabase.from(table).insert(
        draft.priceVariants.map((variant) => ({
          package_id: packageId,
          variant_name: variant.variantName,
          min_pax: variant.minPax,
          max_pax: variant.maxPax,
          price_per_pax: variant.pricePerPax,
          flat_price: variant.flatPrice,
          is_default: variant.isDefault,
        })),
      );
      return written.error ? CHILD_WRITE_ERROR : null;
    },
    async () => {
      const table = "tours_package_inclusions";
      const cleared = await supabase.from(table).delete().eq("package_id", packageId);
      if (cleared.error) return CHILD_WRITE_ERROR;
      if (draft.inclusions.length === 0) return null;
      const written = await supabase.from(table).insert(
        draft.inclusions.map((item, index) => ({
          package_id: packageId,
          item_text: item.text,
          is_included: item.isIncluded,
          display_order: index + 1,
        })),
      );
      return written.error ? CHILD_WRITE_ERROR : null;
    },
    async () => {
      const table = "tours_package_stops";
      const cleared = await supabase.from(table).delete().eq("package_id", packageId);
      if (cleared.error) return CHILD_WRITE_ERROR;
      if (draft.stops.length === 0) return null;
      const written = await supabase.from(table).insert(
        draft.stops.map((stop, index) => ({
          package_id: packageId,
          location_name: stop.locationName,
          description: stop.description,
          latitude: stop.latitude,
          longitude: stop.longitude,
          estimated_duration_minutes: stop.estimatedDurationMinutes,
          stop_order: index + 1,
        })),
      );
      return written.error ? CHILD_WRITE_ERROR : null;
    },
    async () => {
      const table = "tours_package_gallery";
      const cleared = await supabase.from(table).delete().eq("package_id", packageId);
      if (cleared.error) return CHILD_WRITE_ERROR;
      if (draft.galleryImages.length === 0) return null;
      const written = await supabase.from(table).insert(
        draft.galleryImages.map((image, index) => ({
          package_id: packageId,
          image_url: image.imageUrl,
          caption: image.caption,
          display_order: index + 1,
        })),
      );
      return written.error ? CHILD_WRITE_ERROR : null;
    },
  ];

  for (const write of writers) {
    const failure = await write();
    if (failure) {
      console.error("Draft child write failed:", failure);
      return failure;
    }
  }

  return null;
}

/**
 * Saves the wizard's work as a draft (creating it the first time), and — when
 * asked — sends it to the Tourism Office for review.
 */
export async function savePackageDraft(input: SavePackageDraftInput): Promise<SavePackageDraftResult> {
  const submitForReview = input.submitForReview === true;

  const operator = await requireOperator();
  if ("error" in operator) return { success: false, error: operator.error };

  const parsed = parseDraftPayload(input.draft);
  if (!parsed.ok) return { success: false, error: parsed.error };
  const draft = parsed.draft;

  const errors = validateDraft(draft, { requireComplete: submitForReview });
  if (Object.keys(errors).length > 0) {
    return {
      success: false,
      error: submitForReview
        ? "Some details still need attention before this can go to the Tourism Office."
        : "Some details need attention before this can be saved.",
      errors,
    };
  }

  const supabase = await createSupabaseServerClient();
  const existingId = typeof input.packageId === "string" && input.packageId.length > 0 ? input.packageId : null;

  const core = {
    title: draft.title,
    description: draft.description,
    location_name: draft.locationName,
    duration_value: draft.durationValue,
    duration_type: draft.durationType,
    cover_image_url: draft.coverImageUrl,
  };

  let packageId = existingId;
  let updatedAt: string | undefined;

  if (existingId) {
    // Owned by this operator, and not held by the Tourism Office.
    const { data: existing, error: lookupError } = await supabase
      .from(PACKAGE_TABLE)
      .select("id,status,operator_id,updated_at")
      .eq("id", existingId)
      .maybeSingle();

    if (lookupError) {
      console.error("Draft lookup failed:", lookupError.message);
      return { success: false, error: "Unable to reach your draft. Try again." };
    }
    if (!existing || existing.operator_id !== operator.operatorId) {
      return { success: false, error: "This draft could not be found on your account." };
    }
    if (!(EDITABLE_STATUSES as readonly string[]).includes(existing.status)) {
      return {
        success: false,
        error:
          existing.status === "pending_review"
            ? "This package is with the Tourism Office for review, so it can't be changed right now."
            : "This package can no longer be edited.",
      };
    }

    const { data: updated, error: updateError } = await supabase
      .from(PACKAGE_TABLE)
      .update({ ...core, updated_at: new Date().toISOString() })
      .eq("id", existingId)
      .eq("operator_id", operator.operatorId)
      .select("id,updated_at")
      .single();

    if (updateError || !updated) {
      console.error("Draft update failed:", updateError?.message);
      return { success: false, error: "Your draft could not be saved. Try again." };
    }
    updatedAt = updated.updated_at ?? undefined;
  } else {
    const { data: created, error: insertError } = await supabase
      .from(PACKAGE_TABLE)
      .insert({ operator_id: operator.operatorId, status: "draft", ...core })
      .select("id,updated_at")
      .single();

    if (insertError || !created) {
      console.error("Draft creation failed:", insertError?.message);
      return { success: false, error: "Your draft could not be started. Try again." };
    }
    packageId = created.id as string;
    updatedAt = created.updated_at ?? undefined;
  }

  if (!packageId) return { success: false, error: "Your draft could not be started. Try again." };

  const childError = await replaceChildren(supabase, packageId, draft);
  if (childError) {
    // The package row itself is saved, so the operator can carry on and retry.
    return { success: true, packageId, updatedAt, error: childError, status: "draft" };
  }

  if (!submitForReview) {
    return { success: true, packageId, updatedAt, status: "draft" };
  }

  // The database has the last word on whether this package may be reviewed:
  // it re-checks the price options, the default option and the stops.
  const { error: submitError } = await supabase.rpc("submit_package_for_review", { p_package_id: packageId });
  if (submitError) {
    return {
      success: true,
      packageId,
      updatedAt,
      status: "draft",
      notice: `Your work is saved as a draft, but it could not go to the Tourism Office yet: ${submitError.message}`,
    };
  }

  return { success: true, packageId, updatedAt, status: "pending_review" };
}
