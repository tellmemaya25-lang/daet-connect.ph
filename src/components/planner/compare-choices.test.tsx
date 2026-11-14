/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { CompareChoices } from "@/components/planner/compare-choices";
import type { BookablePackage } from "@/lib/tours/itinerary/data";

const pkg: BookablePackage = {
  id: "p-main",
  title: "Bagasbas Beach Surf & Chill Experience",
  coverImageUrl: null,
  matched: ["Bagasbas Beach"],
  price: { amount: 1500, perPerson: true },
  operatorName: "Kalmado Tour Services",
  verified: true,
  notIncluded: [],
  rating: null,
  alternatives: [
    { id: "p-same", title: "Bagasbas Beach Surfing Experience", price: { amount: 1200, perPerson: true }, operatorName: "Daet Tours & Travel", verified: true, shared: ["Bagasbas Beach"], rating: { average: 5, count: 1 }, sameOffer: true },
    { id: "p-sim", title: "Daet beach day", price: { amount: 900, perPerson: true }, operatorName: "Other Op", verified: false, shared: ["Bagasbas Beach"], rating: null, sameOffer: false },
  ],
};

const operators = () => screen.getAllByRole("listitem").map((li) => li.querySelector("p")!.textContent);

describe("CompareChoices", () => {
  it("compares the same tour across operators, cheapest first, with ratings", () => {
    render(<CompareChoices pkg={pkg} group={2} bookHref="/tours/packages/p-main/book?date=2026-12-01&pax=2" canBook />);
    expect(screen.getByText("Compare 2 operators offering this tour")).toBeInTheDocument();
    expect(operators()).toEqual(["Daet Tours & Travel", "Kalmado Tour ServicesSuggested"]);
    expect(screen.getByText("5.0★ (1 review) · Verified by the Tourism Office")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book this instead" })).toHaveAttribute("href", "/tours/packages/p-same/book?date=2026-12-01&pax=2");
  });

  it("widens to similar tours and filters by the picked stars", () => {
    render(<CompareChoices pkg={pkg} group={2} canBook={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Similar tours too" }));
    expect(operators()).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "4★ & up" }));
    expect(screen.getByRole("button", { name: "4★ & up" })).toHaveAttribute("aria-pressed", "true");
    expect(operators()).toEqual(["Daet Tours & Travel"]);
    expect(screen.getByText("2 tours have no reviews yet and are hidden by this rating.")).toBeInTheDocument();
  });

  it("sorts by highest rated", () => {
    render(<CompareChoices pkg={pkg} group={1} canBook={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Highest rated" }));
    expect(operators()[0]).toBe("Daet Tours & Travel");
  });
});
