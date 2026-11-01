/** @jest-environment jsdom */

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { gsap } from "@/lib/gsap";
import { fanGeometry } from "./fan-geometry";
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

// The hero's own geometry at the size the fan renders at before it is measured.
const geometry = fanGeometry(1440, 900, "desktop");

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  gsap.globalTimeline.timeScale(1);
});

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

describe("PlaceFan opening a place", () => {
  // The fold-in runs on a real timeline; speed the clock up rather than sit
  // through 450ms of it, and keep every other suite's timing untouched.
  const hurry = () => gsap.globalTimeline.timeScale(40);

  const openThird = () => {
    renderFan();
    fireEvent.click(screen.getByRole("button", { name: "Bagasbas Beach: open photo and details" }));
  };

  it("opens the panel, marks the wedge expanded and names the place in the URL", () => {
    openThird();

    expect(screen.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeInTheDocument();
    // Open, the wedge's own action is to close, and its label says so.
    expect(screen.getByRole("button", { name: "Bagasbas Beach: close photo and details" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(window.location.hash).toBe("#place-bagasbas-beach");
  });

  it("tells a screen reader which place just opened", () => {
    openThird();

    expect(screen.getByRole("status")).toHaveTextContent("Bagasbas Beach, 3 of 6");
  });

  it("closes on the ✕ and takes the hash away with it", () => {
    openThird();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
    expect(window.location.hash).toBe("");
  });

  it("closes on Escape", () => {
    openThird();
    fireEvent.keyDown(screen.getByRole("heading", { level: 2 }), { key: "Escape" });

    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
    expect(window.location.hash).toBe("");
  });

  it("steps to the next and previous place with the arrow keys, wrapping", () => {
    openThird();

    const panel = screen.getByRole("heading", { level: 2 });

    fireEvent.keyDown(panel, { key: "ArrowRight" });
    expect(screen.getByRole("heading", { level: 2, name: "First Rizal Monument" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#place-first-rizal-monument");

    fireEvent.keyDown(panel, { key: "ArrowLeft" });
    fireEvent.keyDown(panel, { key: "ArrowLeft" });
    expect(screen.getByRole("heading", { level: 2, name: "Apuao sandbar" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#place-apuao-grande-island");
  });

  it("steps with the panel's own arrow buttons too", () => {
    openThird();

    fireEvent.click(screen.getByRole("button", { name: "Previous place" }));
    expect(screen.getByRole("heading", { level: 2, name: "Apuao sandbar" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next place" }));
    expect(screen.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeInTheDocument();
  });

  it("closes when the Back button strips the hash", () => {
    openThird();

    act(() => {
      window.history.replaceState(null, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });

  it("opens straight onto the place a shared link names", () => {
    window.history.replaceState(null, "", "/#place-cathedral-most-holy-trinity");
    renderFan();

    expect(
      screen.getByRole("heading", { level: 2, name: "Cathedral of the Most Holy Trinity" }),
    ).toBeInTheDocument();
    expect(screen.getByText("6 of 6")).toBeInTheDocument();
  });

  it("leaves the panel closed for a hash that names no place", () => {
    window.history.replaceState(null, "", "/#place-nowhere");
    renderFan();

    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });

  it("moves focus into the panel on open, and back to the wedge on close", async () => {
    hurry();
    openThird();

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toHaveFocus(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Previous place" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Apuao sandbar: open photo and details", hidden: true })).toHaveFocus(),
    );
  });

  it("walks the fan with the arrow keys while it is closed", () => {
    renderFan();
    const first = screen.getByRole("button", { name: "Calaguas: open photo and details" });
    first.focus();

    fireEvent.keyDown(first, { key: "ArrowRight" });

    expect(screen.getByRole("button", { name: "Apuao sandbar: open photo and details" })).toHaveFocus();
  });

  it("widens the wedge under a mouse and restores it when the pointer leaves", async () => {
    hurry();
    renderFan();
    const wedge = screen.getByRole("button", { name: "Daet Heritage Center: open photo and details" });

    fireEvent.pointerOver(wedge, { pointerType: "mouse" });
    await waitFor(() => expect(wedge.style.clipPath).toBe(geometry.wedges[4].focusVariants[4]));

    fireEvent.pointerOut(wedge, { pointerType: "mouse" });
    await waitFor(() => expect(wedge.style.clipPath).toBe(geometry.wedges[4].rest));
  });

  it("ignores hovering from a finger, which taps instead", async () => {
    hurry();
    renderFan();
    const wedge = screen.getByRole("button", { name: "Daet Heritage Center: open photo and details" });

    fireEvent.pointerOver(wedge, { pointerType: "touch" });

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(wedge.style.clipPath).toBe(geometry.wedges[4].rest);
  });
});

describe("PlaceFan on a phone", () => {
  /** jsdom has no layout, so the hero is told how big it is. */
  const setHeroSize = (width: number, height: number) =>
    jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("always shows the short names, since a finger cannot hover", () => {
    setHeroSize(390, 844);
    const { container } = renderFan();

    const chips = Array.from(container.querySelectorAll("[data-chip]"));
    expect(chips.map((chip) => chip.textContent)).toEqual([
      "Calaguas",
      "Apuao",
      "Bagasbas",
      "Rizal",
      "Heritage",
      "Cathedral",
    ]);
    chips.forEach((chip) => expect(chip).toHaveClass("opacity-100"));
  });

  it("keeps the headline band to the headline and a hint", () => {
    setHeroSize(390, 844);
    renderFan();

    expect(screen.getByText("Tap a place to see it")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Find a tour" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Beaches, islands and old-town walks/)).not.toBeInTheDocument();
  });

  it("drops the chips and keeps one fan of six on a landscape phone", () => {
    setHeroSize(844, 390);
    const { container } = renderFan();

    expect(container.querySelectorAll("[data-chip]")).toHaveLength(0);
    expect(container.querySelectorAll("[data-wedge]")).toHaveLength(6);
    expect(screen.getByRole("link", { name: "Find a tour" })).toBeInTheDocument();
  });

  it("opens the place as a sheet on a phone", () => {
    setHeroSize(390, 844);
    const { container } = renderFan();

    fireEvent.click(screen.getByRole("button", { name: "Bagasbas Beach: open photo and details" }));

    const sheet = container.querySelector("[data-detail]") as HTMLElement;
    expect(sheet.className).toContain("inset-x-0");
    expect(sheet.className).toContain("bottom-0");
  });

  it("opens full screen on a landscape phone too", () => {
    setHeroSize(844, 390);
    const { container } = renderFan();

    fireEvent.click(screen.getByRole("button", { name: "Bagasbas Beach: open photo and details" }));

    expect((container.querySelector("[data-detail]") as HTMLElement).className).toContain("bottom-0");
  });

  it("moves to the next place on a sideways flick", () => {
    setHeroSize(390, 844);
    const { container } = renderFan();
    fireEvent.click(screen.getByRole("button", { name: "Bagasbas Beach: open photo and details" }));

    const section = container.querySelector("section") as HTMLElement;
    fireEvent.pointerDown(section, { clientX: 300, clientY: 400 });
    fireEvent.pointerUp(section, { clientX: 120, clientY: 410 });

    expect(screen.getByRole("heading", { level: 2, name: "First Rizal Monument" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#place-first-rizal-monument");
  });

  it("ignores a mostly-vertical drag, which belongs to the sheet", () => {
    setHeroSize(390, 844);
    const { container } = renderFan();
    fireEvent.click(screen.getByRole("button", { name: "Bagasbas Beach: open photo and details" }));

    const section = container.querySelector("section") as HTMLElement;
    fireEvent.pointerDown(section, { clientX: 200, clientY: 500 });
    fireEvent.pointerUp(section, { clientX: 220, clientY: 200 });

    expect(screen.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeInTheDocument();
  });

  it("ignores a flick while nothing is open", () => {
    setHeroSize(390, 844);
    const { container } = renderFan();

    const section = container.querySelector("section") as HTMLElement;
    fireEvent.pointerDown(section, { clientX: 300, clientY: 400 });
    fireEvent.pointerUp(section, { clientX: 100, clientY: 400 });

    expect(window.location.hash).toBe("");
  });
});

describe("PlaceFan without JavaScript", () => {
  it("leaves a plain list of the six places for a browser that can't run it", () => {
    const { container } = renderFan();
    const fallback = container.querySelector("noscript");

    expect(fallback).not.toBeNull();
    FAN_PLACES.forEach((place) => {
      expect(fallback?.textContent).toContain(place.name);
      expect(fallback?.textContent).toContain(place.href);
    });
  });
});

describe("PlaceFan with reduced motion", () => {
  const original = window.matchMedia;

  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent: () => false,
      }),
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: original });
  });

  it("still opens the place, but snaps to it instead of folding the fan", () => {
    const { container } = renderFan();

    fireEvent.click(screen.getByRole("button", { name: "Bagasbas Beach: open photo and details" }));

    expect(screen.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeInTheDocument();
    const wedge = container.querySelector('[data-wedge="2"]') as HTMLElement;
    expect(wedge.style.clipPath).toBe(geometry.open);
  });
});
