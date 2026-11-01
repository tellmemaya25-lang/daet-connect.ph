/** @jest-environment jsdom */

import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { PlaceFan } from "./place-fan";
import { FAN_PLACES } from "./fan-places";

/** jsdom has no ResizeObserver; the fan falls back to the server's default size. */
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  Object.defineProperty(global, "ResizeObserver", {
    writable: true,
    value: NoopResizeObserver,
  });
});

const renderFan = (signedIn = false) => render(<PlaceFan places={FAN_PLACES} signedIn={signedIn} />);

describe("PlaceFan", () => {
  it("renders one button per place, in order, inside the labelled group", () => {
    renderFan();

    const group = screen.getByRole("group", { name: "Places in Daet" });
    const buttons = within(group).getAllByRole("button");

    expect(buttons).toHaveLength(6);
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Calaguas: open photo and details",
      "Apuao sandbar: open photo and details",
      "Bagasbas Beach: open photo and details",
      "First Rizal Monument: open photo and details",
      "Daet Heritage Center: open photo and details",
      "Cathedral of the Most Holy Trinity: open photo and details",
    ]);
    buttons.forEach((button) => expect(button).toHaveAttribute("aria-expanded", "false"));
  });

  it("clips each wedge with a nine-point polygon", () => {
    const { container } = renderFan();
    const wedges = container.querySelectorAll("[data-wedge]");

    expect(wedges).toHaveLength(6);
    wedges.forEach((wedge) => {
      const clip = (wedge as HTMLElement).style.clipPath;
      expect(clip).toMatch(/^polygon\(/);
      expect(clip.match(/%/g)).toHaveLength(18);
    });
  });

  it("gives every photo the alt text from its place", () => {
    renderFan();

    FAN_PLACES.forEach((place) => {
      expect(screen.getByAltText(place.photo.alt)).toBeInTheDocument();
    });
  });

  it("keeps the approved headline and subline", () => {
    renderFan();

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Start in Daet.");
    expect(heading).toHaveTextContent("Go anywhere in Camarines Norte.");
    expect(
      screen.getByText(/Beaches, islands and old-town walks, with operators and guides verified/),
    ).toBeInTheDocument();
  });

  it("offers Find a tour, and the assistant for a signed-out visitor", () => {
    renderFan(false);

    expect(screen.getByRole("link", { name: "Find a tour" })).toHaveAttribute("href", "/tours/browse");
    expect(screen.getByRole("button", { name: "Ask the travel guide" })).toBeInTheDocument();
  });

  it("asks the assistant to open when that button is pressed", () => {
    const opened = jest.fn();
    window.addEventListener("daet:open-assistant", opened);

    renderFan(false);
    fireEvent.click(screen.getByRole("button", { name: "Ask the travel guide" }));

    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener("daet:open-assistant", opened);
  });

  it("shows My dashboard instead of the assistant once signed in", () => {
    renderFan(true);

    expect(screen.getByRole("link", { name: "My dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("button", { name: "Ask the travel guide" })).not.toBeInTheDocument();
  });

  it("names every wedge on screen for a mouse visitor to hover", () => {
    const { container } = renderFan();

    const chips = container.querySelectorAll("[data-chip]");
    expect(chips).toHaveLength(6);
    expect(Array.from(chips).map((chip) => chip.textContent)).toEqual([
      "Calaguas",
      "Apuao sandbar",
      "Bagasbas Beach",
      "First Rizal Monument",
      "Daet Heritage Center",
      "Cathedral of the Most Holy Trinity",
    ]);
  });
});
