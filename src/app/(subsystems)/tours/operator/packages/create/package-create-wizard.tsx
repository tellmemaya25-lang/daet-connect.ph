"use client";

/**
 * The five-step create flow.
 *
 * 1 Basics · 2 Photos · 3 Prices · 4 What's included · 5 Route & stops,
 * then a review screen that reuses the editor's summary cards.
 *
 * The work is saved to the server as a draft after every step, so leaving
 * partway keeps everything typed so far; the half-typed step is also copied to
 * localStorage, so a reload does not lose the sentence in progress.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { Notice } from "@/components/ui/notice";
import { BasicDetailsStep } from "./basic-details-step";
import { ReviewStep } from "./review-step";
import { savePackageDraft } from "./actions";
import {
  createEmptyDraft,
  errorsForStep,
  firstStepWithErrors,
  stepIndexOf,
  TOTAL_STEPS,
  validateDraft,
  WIZARD_STEPS,
  type SavePackageDraftResult,
  type WizardStep,
} from "./draft-validation";
import { clearStoredDraft, readStoredDraft, writeStoredDraft, type StoredDraft } from "./draft-storage";
import { useUnsavedChangesGuard } from "./use-unsaved-changes-guard";
import { CoverImageStep } from "../[id]/edit/CoverImageStep";
import { GalleryStep } from "../[id]/edit/GalleryStep";
import { InclusionsStep } from "../[id]/edit/InclusionsStep";
import { PricingStep } from "../[id]/edit/PricingStep";
import { StopsStep } from "../[id]/edit/StopsStep";
import { detectChanges } from "../[id]/edit/change-detection";
import type { EditPackageFormData, ValidationErrors } from "../[id]/edit/edit-types";
import type { PackageSectionId } from "../components/package-draft";

interface PackageCreateWizardProps {
  operatorName?: string;
}

function formatClock(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

export function PackageCreateWizard({ operatorName }: PackageCreateWizardProps) {
  const router = useRouter();
  const { toast } = useFeedback();

  const [draft, setDraft] = useState<EditPackageFormData>(createEmptyDraft);
  const [packageId, setPackageId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [onReview, setOnReview] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedDraft, setSavedDraft] = useState<EditPackageFormData | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [restorable, setRestorable] = useState<StoredDraft | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const step: WizardStep = WIZARD_STEPS[stepIndex];
  const stepErrorCount = Object.keys(errorsForStep(errors, step.id)).length;

  const hasUnsavedChanges = useMemo(
    () => detectChanges(savedDraft ?? createEmptyDraft(), draft),
    [savedDraft, draft],
  );
  const hasStarted = useMemo(() => detectChanges(createEmptyDraft(), draft), [draft]);

  useUnsavedChangesGuard(hasUnsavedChanges);

  // Keep a copy on this device, including the half-typed step. Debounced, so a
  // long description is not rewritten on every keystroke.
  useEffect(() => {
    if (!hasStarted) return;
    const timer = setTimeout(() => {
      writeStoredDraft({ packageId, draft, stepIndex, savedAt: new Date().toISOString() });
    }, 250);
    return () => clearTimeout(timer);
  }, [draft, packageId, stepIndex, hasStarted]);

  // Move focus to the problem when a step cannot be saved, so a keyboard user
  // is told what happened instead of being left at the bottom of the page.
  useEffect(() => {
    if (errorMessage) errorRef.current?.focus();
  }, [errorMessage]);

  // Offer last session's work back, after the page has rendered.
  useEffect(() => {
    const stored = readStoredDraft();
    if (stored && detectChanges(createEmptyDraft(), stored.draft)) setRestorable(stored);
  }, []);

  const update = useCallback((patch: Partial<EditPackageFormData>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setErrorMessage(null);
  }, []);

  const persist = useCallback(
    async (submitForReview: boolean): Promise<SavePackageDraftResult> => {
      setSaving(true);
      setErrorMessage(null);
      try {
        const result = await savePackageDraft({ packageId, draft, submitForReview });
        if (result.packageId) setPackageId(result.packageId);
        if (result.errors) setErrors(result.errors);

        if (result.success) {
          setSavedDraft(draft);
          setSavedAt(result.updatedAt ?? new Date().toISOString());
          setMessage(submitForReview ? "Sent for review" : "Draft saved");
        } else {
          setMessage(null);
          setErrorMessage(result.error ?? "Your draft could not be saved. Try again.");
        }
        return result;
      } catch {
        setMessage(null);
        setErrorMessage("Your draft could not be saved. Check your connection and try again.");
        return { success: false, error: "Save failed" };
      } finally {
        setSaving(false);
      }
    },
    [draft, packageId],
  );

  const goToStep = useCallback((id: PackageSectionId) => {
    setOnReview(false);
    setStepIndex(Math.max(0, stepIndexOf(id)));
  }, []);

  /** Jumping to a section by hand (the review screen's Edit / Add links). */
  const editSection = useCallback(
    (id: PackageSectionId) => {
      setErrorMessage(null);
      goToStep(id);
    },
    [goToStep],
  );

  const handleContinue = useCallback(async () => {
    const validated = validateDraft(draft, { requireComplete: false });
    setErrors(validated);

    const scoped = errorsForStep(validated, step.id);
    if (Object.keys(scoped).length > 0) {
      setShowAllErrors(true);
      setErrorMessage("A few fields need fixing before you can continue.");
      return;
    }

    setShowAllErrors(false);
    const result = await persist(false);
    if (!result.success) {
      const blockedBy = result.errors ? firstStepWithErrors(result.errors) : null;
      if (blockedBy) goToStep(blockedBy);
      return;
    }

    setErrorMessage(result.error ?? null);
    if (stepIndex === TOTAL_STEPS - 1) setOnReview(true);
    else setStepIndex(stepIndex + 1);
  }, [draft, persist, step.id, stepIndex, goToStep]);

  const handleBack = useCallback(() => {
    setErrorMessage(null);
    setShowAllErrors(false);
    if (onReview) {
      setOnReview(false);
      setStepIndex(TOTAL_STEPS - 1);
      return;
    }
    setStepIndex((current) => Math.max(0, current - 1));
  }, [onReview]);

  const handleSaveAndFinish = useCallback(async () => {
    const result = await persist(false);
    if (!result.success) return;
    clearStoredDraft();
    toast("Draft saved. You can finish it any time from your packages.", "success");
    router.push("/tours/operator/packages");
  }, [persist, router, toast]);

  const handleSubmitForReview = useCallback(async () => {
    const result = await persist(true);
    if (!result.success) {
      const blockedBy = result.errors ? firstStepWithErrors(result.errors) : null;
      if (blockedBy) goToStep(blockedBy);
      setShowAllErrors(true);
      return;
    }

    clearStoredDraft();
    if (result.status === "pending_review") {
      router.push("/tours/operator/packages?submitted=true");
      return;
    }
    // Saved, but not complete enough for review: finish it in the editor.
    toast(result.notice ?? "Saved as a draft.", "info");
    router.push(`/tours/operator/packages/${result.packageId}/edit`);
  }, [goToStep, persist, router, toast]);

  const restore = useCallback(() => {
    if (!restorable) return;
    setDraft(restorable.draft);
    setPackageId(restorable.packageId);
    setStepIndex(restorable.stepIndex);
    setOnReview(false);
    setRestorable(null);
    setMessage("Unsaved work restored");
  }, [restorable]);

  const discardRestored = useCallback(() => {
    clearStoredDraft();
    setRestorable(null);
  }, []);

  const progressPercent = onReview ? 100 : ((stepIndex + 1) / (TOTAL_STEPS + 1)) * 100;
  const savedClock = formatClock(savedAt);

  return (
    <div className="pb-40 sm:pb-32">
      {restorable ? (
        <div className="mb-5">
          <Notice variant="info" title="Pick up where you left off?">
            <p>
              You have unsaved work from {formatClock(restorable.savedAt) ?? "earlier"} on this
              device.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button variant="secondary" onClick={restore}>
                Restore my work
              </Button>
              <Button variant="ghost" onClick={discardRestored}>
                Start fresh
              </Button>
            </div>
          </Notice>
        </div>
      ) : null}

      {operatorName ? (
        <p className="mb-3 text-sm text-daet-ink/75">Creating a package for {operatorName}.</p>
      ) : null}

      <div className="space-y-2">
        <p className="text-sm font-bold text-daet-ink" aria-live="polite">
          {onReview ? "Final check: review your package" : `Step ${stepIndex + 1} of ${TOTAL_STEPS}: ${step.label}`}
        </p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted-strong">
          <div
            className="h-2 rounded-full bg-blue-600"
            style={{ width: `${progressPercent}%` }}
            aria-hidden="true"
          />
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {onReview ? (
          <ReviewStep draft={draft} onEdit={editSection} />
        ) : (
          <>
            <div>
              <h2 className="text-2xl font-bold text-daet-ink">{step.title}</h2>
              <p className="mt-1 text-sm leading-6 text-daet-ink/75">{step.description}</p>
            </div>

            <StepBody
              step={step}
              draft={draft}
              savedDraft={savedDraft}
              packageId={packageId}
              errors={errors}
              showAllErrors={showAllErrors}
              saving={saving}
              onUpdate={update}
            />
          </>
        )}
      </div>

      <div aria-live="polite" className="mt-6 min-h-6 text-sm text-daet-ink/75">
        {saving
          ? "Saving…"
          : hasUnsavedChanges
            ? "Unsaved changes"
            : message && savedClock
              ? `${message} at ${savedClock}`
              : null}
      </div>

      {errorMessage ? (
        <div className="mb-4" ref={errorRef} tabIndex={-1}>
          <Notice variant="error" title="Please check this">
            {errorMessage}
            {stepErrorCount > 0 ? " Check the fields above." : null}
          </Notice>
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-[var(--tab-bar-h)] z-30 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:bottom-0">
        <div className="mx-auto flex max-w-4xl flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            {stepIndex > 0 || onReview ? (
              <Button variant="ghost" onClick={handleBack} disabled={saving}>
                Back
              </Button>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button variant="secondary" onClick={handleSaveAndFinish} disabled={saving || !hasStarted}>
              {saving ? "Saving…" : "Save & finish later"}
            </Button>
            {onReview ? (
              <Button onClick={handleSubmitForReview} disabled={saving} loading={saving} loadingText="Sending…">
                Submit for review
              </Button>
            ) : (
              <Button onClick={handleContinue} disabled={saving} loading={saving} loadingText="Saving…">
                {stepIndex === TOTAL_STEPS - 1 ? "Review package" : "Save & continue"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Renders the current step. The photo, price, inclusion and stop steps are the
 * editor's own components — the same ones operators meet when they come back to
 * change a package — so the two screens cannot drift apart.
 */
function StepBody({
  step,
  draft,
  savedDraft,
  packageId,
  errors,
  showAllErrors,
  saving,
  onUpdate,
}: {
  step: WizardStep;
  draft: EditPackageFormData;
  savedDraft: EditPackageFormData | null;
  packageId: string | null;
  errors: ValidationErrors;
  showAllErrors: boolean;
  saving: boolean;
  onUpdate: (patch: Partial<EditPackageFormData>) => void;
}) {
  const original = savedDraft ?? draft;
  const scopedErrors = errorsForStep(errors, step.id);

  switch (step.id) {
    case "basics":
      return (
        <BasicDetailsStep
          data={draft}
          errors={scopedErrors}
          showAllErrors={showAllErrors}
          onUpdate={onUpdate}
        />
      );

    case "photos":
      if (!packageId) {
        return (
          <Notice variant="info" title="Save the basics first">
            Photos are attached to your draft, so finish step 1 and come back.
          </Notice>
        );
      }
      return (
        <div className="space-y-6">
          <CoverImageStep
            packageId={packageId}
            data={{ coverImageUrl: draft.coverImageUrl }}
            originalData={{ coverImageUrl: original.coverImageUrl }}
            packageStatus="draft"
            onUpdate={(next) => onUpdate({ coverImageUrl: next.coverImageUrl })}
            errors={scopedErrors}
            loading={saving}
          />
          <GalleryStep
            packageId={packageId}
            data={draft.galleryImages}
            originalData={original.galleryImages}
            packageStatus="draft"
            onUpdate={(next) => onUpdate({ galleryImages: next })}
            errors={scopedErrors}
            loading={saving}
          />
        </div>
      );

    case "prices":
      return (
        <PricingStep
          data={draft.priceVariants}
          originalData={original.priceVariants}
          packageStatus="draft"
          onUpdate={(next) => onUpdate({ priceVariants: next })}
          errors={scopedErrors}
          loading={saving}
        />
      );

    case "included":
      return (
        <InclusionsStep
          data={draft.inclusions}
          originalData={original.inclusions}
          packageStatus="draft"
          onUpdate={(next) => onUpdate({ inclusions: next })}
          errors={scopedErrors}
          loading={saving}
        />
      );

    case "stops":
      return (
        <StopsStep
          data={draft.stops}
          originalData={original.stops}
          packageStatus="draft"
          onUpdate={(next) => onUpdate({ stops: next })}
          errors={scopedErrors}
          loading={saving}
        />
      );

    default:
      return null;
  }
}
