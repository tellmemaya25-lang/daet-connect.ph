/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ReviewStep } from "./review-step";
import { createEmptyDraft } from "./draft-validation";
import type { EditPackageFormData } from "../[id]/edit/edit-types";

function filledDraft(): EditPackageFormData {
  return {
    ...createEmptyDraft(),
    title: "Bagasbas surf lesson for beginners",
    description: "Two hours with a local instructor.",
    locationName: "Bagasbas Beach, Daet",
    durationValue: 3,
    durationType: "hours",
    coverImageUrl: "https://example.test/cover.jpg",
    priceVariants: [
      { variantName: "Standard", minPax: 1, maxPax: 8, pricePerPax: 950, flatPrice: null, isDefault: true },
      { variantName: "Group of six", minPax: 6, maxPax: null, pricePerPax: null, flatPrice: 5000, isDefault: false },
    ],
    inclusions: [
      { text: "Board and rash guard", isIncluded: true, displayOrder: 1 },
      { text: "Travel insurance", isIncluded: false, displayOrder: 2 },
    ],
    stops: [
      {
        locationName: "Bagasbas Beach",
        description: "Meet at the lifeguard station.",
        latitude: 14.1122,
        longitude: 122.9553,
        estimatedDurationMinutes: 120,
        stopOrder: 1,
      },
    ],
  };
}

describe("ReviewStep", () => {
  it("ticks off the checklist when the package is complete", () => {
    render(<ReviewStep draft={filledDraft()} onEdit={jest.fn()} />);

    expect(mockDoneBadges()).toHaveLength(4);
    expect(screen.getByText(/Everything the Tourism Office needs/)).toBeInTheDocument();
  });

  it("shows what is still missing and offers a way to add it", () => {
    const onEdit = jest.fn();
    render(<ReviewStep draft={createEmptyDraft()} onEdit={onEdit} />);

    expect(mockDoneBadges()).toHaveLength(0);
    expect(screen.getByText(/worth adding first/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Add add at least one price option/i }));
    expect(onEdit).toHaveBeenCalledWith("prices");
  });

  it("summarises every section, including prices and stops", () => {
    render(<ReviewStep draft={filledDraft()} onEdit={jest.fn()} />);

    expect(screen.getByText("Bagasbas surf lesson for beginners")).toBeInTheDocument();
    expect(screen.getByText("Bagasbas Beach, Daet")).toBeInTheDocument();
    expect(screen.getByText("₱950.00 per guest")).toBeInTheDocument();
    expect(screen.getByText("₱5,000.00 for the group")).toBeInTheDocument();
    expect(screen.getByText("Board and rash guard")).toBeInTheDocument();
    expect(screen.getByText("Travel insurance")).toBeInTheDocument();
    expect(screen.getByText("Meet at the lifeguard station.")).toBeInTheDocument();
  });

  it("lets the operator jump back into any section to change it", () => {
    const onEdit = jest.fn();
    render(<ReviewStep draft={filledDraft()} onEdit={onEdit} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit what's included" }));
    expect(onEdit).toHaveBeenCalledWith("included");
  });
});

function mockDoneBadges() {
  return screen.queryAllByText("Done");
}
