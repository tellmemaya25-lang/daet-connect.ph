/** @jest-environment jsdom */

import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { PackageCreateWizard } from "./package-create-wizard";
import { savePackageDraft } from "./actions";
import { DRAFT_STORAGE_KEY, readStoredDraft } from "./draft-storage";
import { createEmptyDraft, type SavePackageDraftResult } from "./draft-validation";
import { FeedbackProvider } from "@/components/ui/feedback";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: jest.fn() }),
}));

jest.mock("./actions", () => ({ savePackageDraft: jest.fn() }));

// The photo, price, inclusion and stop steps are the editor's own components;
// their behaviour is covered by the editor's tests. Here they are reduced to a
// button so the wizard's own flow is what is under test.
jest.mock("../[id]/edit/CoverImageStep", () => ({ CoverImageStep: () => null }));
jest.mock("../[id]/edit/GalleryStep", () => ({ GalleryStep: () => null }));
jest.mock("../[id]/edit/InclusionsStep", () => ({
  InclusionsStep: ({ data, onUpdate }: { data: unknown[]; onUpdate: (next: unknown[]) => void }) => (
    <button type="button" onClick={() => onUpdate([{ text: "Board and rash guard", isIncluded: true, displayOrder: 1 }])}>
      Stub: add inclusion
    </button>
  ),
}));
jest.mock("../[id]/edit/PricingStep", () => ({
  PricingStep: ({ data, onUpdate }: { data: unknown[]; onUpdate: (next: unknown[]) => void }) => (
    <button
      type="button"
      onClick={() =>
        onUpdate([
          ...data,
          { variantName: "Standard", minPax: 1, maxPax: 8, pricePerPax: 950, flatPrice: null, isDefault: true },
        ])
      }
    >
      Stub: add price option
    </button>
  ),
}));
jest.mock("./stops-picker", () => ({
  CreateStopsPicker: ({ stops, onChange }: { stops: unknown[]; onChange: (next: unknown[]) => void }) => (
    <button
      type="button"
      onClick={() =>
        onChange([
          ...stops,
          {
            locationName: "Bagasbas Beach",
            description: "Meet at the lifeguard station.",
            latitude: 14.1122,
            longitude: 122.9553,
          },
        ])
      }
    >
      Stub: add stop
    </button>
  ),
}));

const mockSave = savePackageDraft as jest.MockedFunction<typeof savePackageDraft>;

function saved(overrides: Partial<SavePackageDraftResult> = {}): SavePackageDraftResult {
  return {
    success: true,
    packageId: "pkg-1",
    status: "draft",
    updatedAt: "2026-11-07T08:15:00.000Z",
    ...overrides,
  };
}

function renderWizard() {
  return render(
    <FeedbackProvider>
      <PackageCreateWizard operatorName="Bagasbas Coast Tours" />
    </FeedbackProvider>,
  );
}

function fillBasics() {
  fireEvent.change(screen.getByLabelText(/package title/i), {
    target: { value: "Bagasbas surf lesson for beginners" },
  });
  fireEvent.change(screen.getByLabelText(/where the tour starts/i), {
    target: { value: "Bagasbas Beach, Daet" },
  });
}

/**
 * Clicks something whose handler awaits the server action, and lets the
 * resulting state updates settle inside act().
 */
async function clickAndSettle(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

async function continueStep() {
  await clickAndSettle("Save & continue");
}

async function reachReview() {
  fillBasics();
  await continueStep();
  await screen.findByText("Step 2 of 5: Photos");
  await continueStep();
  await screen.findByText(/Step 3 of 5: Prices/);
  fireEvent.click(screen.getByRole("button", { name: "Stub: add price option" }));
  await continueStep();
  await screen.findByText(/Step 4 of 5: What's included/);
  fireEvent.click(screen.getByRole("button", { name: "Stub: add inclusion" }));
  await continueStep();
  await screen.findByText(/Step 5 of 5: Route & stops/);
  fireEvent.click(screen.getByRole("button", { name: "Stub: add stop" }));
  await clickAndSettle("Review package");
  await screen.findByText(/Final check/);
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  mockSave.mockResolvedValue(saved());
});

describe("create wizard", () => {
  it("shows where the operator is, starting at step 1 of 5", () => {
    renderWizard();

    expect(screen.getByText("Step 1 of 5: Basics")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Package basics" })).toBeInTheDocument();
  });

  it("saves the draft after each step and carries the new package id forward", async () => {
    renderWizard();
    fillBasics();

    await continueStep();
    await screen.findByText("Step 2 of 5: Photos");

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave.mock.calls[0][0]).toMatchObject({
      packageId: null,
      submitForReview: false,
    });
    expect(mockSave.mock.calls[0][0].draft).toMatchObject({
      title: "Bagasbas surf lesson for beginners",
      locationName: "Bagasbas Beach, Daet",
    });

    await continueStep();
    await screen.findByText("Step 3 of 5: Prices");

    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(mockSave.mock.calls[1][0].packageId).toBe("pkg-1");
    // The saved-draft note names the time, so the operator can see it happened.
    expect(await screen.findByText(/Draft saved at/)).toBeInTheDocument();
  });

  it("stops at a field that needs fixing instead of saving a broken step", async () => {
    renderWizard();
    fireEvent.change(screen.getByLabelText(/where the tour starts/i), {
      target: { value: "Daet" },
    });

    await continueStep();

    expect(screen.getByText("Step 1 of 5: Basics")).toBeInTheDocument();
    expect(await screen.findByText("Title is required.")).toBeInTheDocument();
    expect(screen.getByText(/A few fields need fixing/i)).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("keeps what was typed when the operator goes back a step", async () => {
    renderWizard();
    fillBasics();
    await continueStep();
    await screen.findByText("Step 2 of 5: Photos");

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(await screen.findByText("Step 1 of 5: Basics")).toBeInTheDocument();
    expect(screen.getByLabelText(/package title/i)).toHaveValue("Bagasbas surf lesson for beginners");
  });

  it("reviews the package with the editor's summary and submits it", async () => {
    renderWizard();
    await reachReview();

    // The review reuses the editor's section cards, so the values read back.
    expect(screen.getByText("Bagasbas surf lesson for beginners")).toBeInTheDocument();
    expect(screen.getByText("Bagasbas Beach, Daet")).toBeInTheDocument();
    expect(screen.getByText("Standard")).toBeInTheDocument();
    expect(screen.getByText("₱950.00 per guest")).toBeInTheDocument();
    expect(screen.getByText("Board and rash guard")).toBeInTheDocument();

    mockSave.mockResolvedValue(saved({ status: "pending_review" }));
    await clickAndSettle("Submit for review");

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/tours/operator/packages?submitted=true"));
    const lastCall = mockSave.mock.calls[mockSave.mock.calls.length - 1][0];
    expect(lastCall.submitForReview).toBe(true);
    expect(lastCall.packageId).toBe("pkg-1");
    // The device copy is cleared once the package is on its way.
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("goes back to the step that needs work when the server refuses a submit", async () => {
    renderWizard();
    await reachReview();

    mockSave.mockResolvedValue({
      success: false,
      error: "Some details still need attention before this can go to the Tourism Office.",
      errors: { stops: "Add at least one itinerary stop." },
    });
    await clickAndSettle("Submit for review");

    expect(await screen.findByText("Step 5 of 5: Route & stops")).toBeInTheDocument();
    expect(screen.getByText(/Some details still need attention/)).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("finishes later: saves and returns to the package list", async () => {
    renderWizard();
    fillBasics();

    await clickAndSettle("Save & finish later");

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/tours/operator/packages"));
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it("keeps a copy of the half-typed step on the device", async () => {
    renderWizard();
    fillBasics();

    await waitFor(() => expect(readStoredDraft()?.draft.title).toBe("Bagasbas surf lesson for beginners"));
    expect(readStoredDraft()?.draft.locationName).toBe("Bagasbas Beach, Daet");
  });

  it("brings back the work the browser wrote, after a reload", async () => {
    // The round trip, not just one half of it: the wizard writes the device copy
    // as the operator types, and a fresh mount has to read that exact value back.
    const first = renderWizard();
    fillBasics();
    await waitFor(() =>
      expect(readStoredDraft()?.draft.title).toBe("Bagasbas surf lesson for beginners"),
    );
    first.unmount();

    renderWizard();

    expect(await screen.findByText(/Pick up where you left off/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore my work" }));
    expect(await screen.findByLabelText(/package title/i)).toHaveValue(
      "Bagasbas surf lesson for beginners",
    );
  });

  it("offers last session's work back after a reload", async () => {
    window.localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({
        packageId: "pkg-9",
        stepIndex: 2,
        savedAt: "2026-11-07T07:30:00.000Z",
        draft: {
          ...createEmptyDraft(),
          title: "Daet heritage walk",
          locationName: "Rizal Monument, Daet",
        },
      }),
    );

    renderWizard();

    expect(await screen.findByText(/Pick up where you left off/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore my work" }));

    expect(await screen.findByText(/Step 3 of 5: Prices/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByLabelText(/package title/i)).toHaveValue("Daet heritage walk");
  });

  it("can start fresh instead of restoring", async () => {
    window.localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({
        packageId: "pkg-9",
        stepIndex: 1,
        savedAt: "2026-11-07T07:30:00.000Z",
        draft: { ...createEmptyDraft(), title: "Daet heritage walk", locationName: "Daet" },
      }),
    );

    renderWizard();
    fireEvent.click(await screen.findByRole("button", { name: "Start fresh" }));

    expect(screen.getByText("Step 1 of 5: Basics")).toBeInTheDocument();
    expect(screen.getByLabelText(/package title/i)).toHaveValue("");
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });
});
