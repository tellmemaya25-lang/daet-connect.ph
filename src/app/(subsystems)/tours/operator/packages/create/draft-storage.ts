/**
 * A safety copy of an unfinished package, kept on the operator's device.
 *
 * The wizard already saves the draft to the server after every step, so this is
 * the second line of defence: it also keeps the half-typed step, so a phone that
 * drops the connection or a page that reloads mid-sentence does not lose the
 * sentence. Every storage call is wrapped: a browser with storage disabled, or
 * full, must never break the form.
 */

import { createEmptyDraft } from "./draft-validation";
import type { EditPackageFormData } from "../[id]/edit/edit-types";

export const DRAFT_STORAGE_KEY = "daet:package-create-draft:v1";

export interface StoredDraft {
  packageId: string | null;
  draft: EditPackageFormData;
  stepIndex: number;
  savedAt: string;
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** A stored value is only used when it still looks like a draft. */
function coerceDraft(value: unknown): EditPackageFormData | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<EditPackageFormData>;
  if (typeof candidate.title !== "string" || typeof candidate.locationName !== "string") return null;

  const empty = createEmptyDraft();
  const durationValue = Number(candidate.durationValue);
  return {
    title: candidate.title,
    description: typeof candidate.description === "string" ? candidate.description : null,
    locationName: candidate.locationName,
    durationValue: Number.isFinite(durationValue) ? durationValue : empty.durationValue,
    durationType: candidate.durationType === "hours" ? "hours" : "days",
    coverImageUrl: typeof candidate.coverImageUrl === "string" ? candidate.coverImageUrl : null,
    priceVariants: Array.isArray(candidate.priceVariants) ? candidate.priceVariants : [],
    inclusions: Array.isArray(candidate.inclusions) ? candidate.inclusions : [],
    stops: Array.isArray(candidate.stops) ? candidate.stops : [],
    galleryImages: Array.isArray(candidate.galleryImages) ? candidate.galleryImages : [],
  };
}

export function readStoredDraft(): StoredDraft | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Partial<StoredDraft>;
    const draft = coerceDraft(record.draft);
    if (!draft) return null;
    return {
      packageId: typeof record.packageId === "string" ? record.packageId : null,
      draft,
      stepIndex: Number.isInteger(record.stepIndex) ? Math.max(0, Math.min(4, record.stepIndex as number)) : 0,
      savedAt: typeof record.savedAt === "string" ? record.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function writeStoredDraft(value: StoredDraft): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(DRAFT_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Out of quota or storage blocked: the server draft is still safe.
  }
}

export function clearStoredDraft(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Nothing to do; the next save overwrites it anyway.
  }
}
