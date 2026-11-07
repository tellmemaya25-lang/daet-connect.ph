/**
 * The create wizard's draft shape, steps and validation.
 *
 * The wizard keeps the package in the same shape the editor works with
 * (`EditPackageFormData`), and validates it with the editor's own rules
 * (`validation.ts` + `EDIT_LIMITS`), so creating and editing can never
 * disagree about what a valid package is.
 *
 * Nothing here talks to the database or to the network: the client uses it to
 * decide whether a step may advance, and the server action in `actions.ts` runs
 * the exact same checks again before writing anything.
 */

import { EDIT_LIMITS } from "../[id]/edit/edit-constants";
import type { PackageSectionId } from "../components/package-draft";
import type {
  EditGalleryImage,
  EditInclusion,
  EditPackageFormData,
  EditPriceVariant,
  EditStop,
  ValidationErrors,
} from "../[id]/edit/edit-types";
import {
  validateBasicInfo,
  validateCaption,
  validateGallery,
  validateInclusionText,
  validateInclusions,
  validatePricing,
  validateStop,
  validateStops,
  validateVariant,
} from "../[id]/edit/validation";

/** The five data steps of the create flow. The review screen comes after them. */
export type WizardStepId = PackageSectionId;

export interface WizardStep {
  id: WizardStepId;
  /** Short name for the progress indicator. */
  label: string;
  title: string;
  description: string;
}

export const WIZARD_STEPS: readonly WizardStep[] = [
  {
    id: "basics",
    label: "Basics",
    title: "Package basics",
    description: "What the tour is, where it starts and how long it takes.",
  },
  {
    id: "photos",
    label: "Photos",
    title: "Photos",
    description: "A cover photo, then a few shots of what guests will see.",
  },
  {
    id: "prices",
    label: "Prices",
    title: "Price options",
    description: "What guests pay, and the group sizes you take.",
  },
  {
    id: "included",
    label: "What's included",
    title: "What's included",
    description: "Everything the price covers, and what it doesn't.",
  },
  {
    id: "stops",
    label: "Route & stops",
    title: "Route & stops",
    description: "The places the tour visits, in the order guests see them.",
  },
] as const;

export const TOTAL_STEPS = WIZARD_STEPS.length;

/** A brand-new package, before the operator has typed anything. */
export function createEmptyDraft(): EditPackageFormData {
  return {
    title: "",
    description: null,
    locationName: "",
    durationValue: 1,
    durationType: "days",
    coverImageUrl: null,
    priceVariants: [],
    inclusions: [],
    stops: [],
    galleryImages: [],
  };
}

/** Where each group of fields lives, so an error can point at its step. */
const ROOT_TO_STEP: Record<string, WizardStepId> = {
  title: "basics",
  locationName: "basics",
  description: "basics",
  durationValue: "basics",
  durationType: "basics",
  coverImageUrl: "photos",
  galleryImages: "photos",
  priceVariants: "prices",
  inclusions: "included",
  stops: "stops",
};

export function stepForErrorKey(key: string): WizardStepId | null {
  return ROOT_TO_STEP[key.split(".")[0]] ?? null;
}

/** The subset of an error map that belongs to one step. */
export function errorsForStep(errors: ValidationErrors, step: WizardStepId): ValidationErrors {
  const scoped: ValidationErrors = {};
  for (const [key, message] of Object.entries(errors)) {
    if (stepForErrorKey(key) === step) scoped[key] = message;
  }
  return scoped;
}

/** The first step (in flow order) that has a problem, or null when clean. */
export function firstStepWithErrors(errors: ValidationErrors): WizardStepId | null {
  for (const step of WIZARD_STEPS) {
    if (Object.keys(errorsForStep(errors, step.id)).length > 0) return step.id;
  }
  return null;
}

export function stepIndexOf(id: WizardStepId): number {
  return WIZARD_STEPS.findIndex((step) => step.id === id);
}

/**
 * Validates a wizard draft.
 *
 * `requireComplete: false` is the "save my draft" case: a draft may still be
 * missing prices, inclusions or stops, so only the values that *are* there are
 * checked (a 0-peso price option or a 2-character stop name is refused either
 * way). `requireComplete: true` is the "submit for review" case and applies the
 * editor's full rules, because the Tourism Office will read it next.
 */
export function validateDraft(
  draft: EditPackageFormData,
  { requireComplete }: { requireComplete: boolean },
): ValidationErrors {
  const errors: ValidationErrors = { ...validateBasicInfo(draft).errors };

  if (requireComplete) {
    Object.assign(errors, validatePricing(draft.priceVariants).errors);
  } else {
    draft.priceVariants.forEach((variant, index) => {
      Object.assign(errors, validateVariant(variant, `priceVariants.${index}.`));
    });
  }

  if (requireComplete) {
    Object.assign(errors, validateInclusions(draft.inclusions).errors);
  } else {
    draft.inclusions.forEach((item, index) => {
      const message = validateInclusionText(item.text);
      if (message) errors[`inclusions.${index}.text`] = message;
    });
  }

  if (requireComplete) {
    Object.assign(errors, validateStops(draft.stops).errors);
  } else {
    draft.stops.forEach((stop, index) => {
      Object.assign(errors, validateStop(stop, `stops.${index}.`));
    });
  }

  Object.assign(errors, validateGallery(draft.galleryImages).errors);
  draft.galleryImages.forEach((image, index) => {
    const message = validateCaption(image.caption);
    if (message) errors[`galleryImages.${index}.caption`] = message;
  });

  if (draft.coverImageUrl !== null && typeof draft.coverImageUrl !== "string") {
    errors.coverImageUrl = "Cover photo is invalid.";
  }

  return errors;
}

/** Human-readable summary of an error map, for the review screen's notice. */
export function describeErrors(errors: ValidationErrors): string[] {
  return Object.values(errors);
}

/** Counts the things the editor can cap, for hints such as "13 of 50 items". */
export const wizardLimits = {
  inclusions: EDIT_LIMITS.maxInclusions,
  stops: EDIT_LIMITS.maxStops,
  gallery: EDIT_LIMITS.maxGalleryImages,
} as const;

export type { EditGalleryImage, EditInclusion, EditPackageFormData, EditPriceVariant, EditStop };

/** The server action's result contract, shared by the wizard and its tests. */
export interface SavePackageDraftResult {
  success: boolean;
  packageId?: string | null;
  errors?: ValidationErrors;
  error?: string;
  /** Set when the draft was saved but could not go to review (e.g. not complete). */
  notice?: string;
  status?: "draft" | "pending_review";
  updatedAt?: string;
}
