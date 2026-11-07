/** @jest-environment jsdom */

import { clearStoredDraft, DRAFT_STORAGE_KEY, readStoredDraft, writeStoredDraft } from "./draft-storage";
import { createEmptyDraft } from "./draft-validation";

const draft = {
  ...createEmptyDraft(),
  title: "Daet heritage walk",
  locationName: "Rizal Monument, Daet",
};

beforeEach(() => window.localStorage.clear());

describe("draft storage", () => {
  it("round-trips a draft", () => {
    writeStoredDraft({ packageId: "pkg-1", draft, stepIndex: 2, savedAt: "2026-11-07T08:00:00.000Z" });

    expect(readStoredDraft()).toMatchObject({
      packageId: "pkg-1",
      stepIndex: 2,
      savedAt: "2026-11-07T08:00:00.000Z",
      draft: { title: "Daet heritage walk" },
    });
  });

  it("returns nothing when there is no copy", () => {
    expect(readStoredDraft()).toBeNull();
  });

  it("ignores unreadable or foreign values instead of breaking the form", () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, "{not json");
    expect(readStoredDraft()).toBeNull();

    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ draft: { title: 42 } }));
    expect(readStoredDraft()).toBeNull();
  });

  it("clamps a step index that does not fit the flow", () => {
    window.localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ packageId: null, draft, stepIndex: 99, savedAt: "2026-11-07T08:00:00.000Z" }),
    );

    expect(readStoredDraft()?.stepIndex).toBe(4);
  });

  it("survives storage that throws (blocked cookies, full disk)", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    } as unknown as Storage;
    Object.defineProperty(window, "localStorage", { configurable: true, value: blocked });

    try {
      expect(() => writeStoredDraft({ packageId: null, draft, stepIndex: 0, savedAt: "now" })).not.toThrow();
      expect(readStoredDraft()).toBeNull();
      expect(() => clearStoredDraft()).not.toThrow();
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
    }
  });

  it("does nothing at all when storage is unavailable", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", { configurable: true, get: () => undefined });

    try {
      expect(() => writeStoredDraft({ packageId: null, draft, stepIndex: 0, savedAt: "now" })).not.toThrow();
      expect(readStoredDraft()).toBeNull();
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
    }
  });
});
