/**
 * @jest-environment jsdom
 */

import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { AskBand } from "./ask-band";
import { GettingHere } from "./getting-here";
import { HomeMap, type MapPlace } from "./home-map";
import { TripCard } from "./trip-card";
import { GETTING_HERE, GETTING_HERE_CHECK, GETTING_HERE_SOURCES } from "@/lib/getting-here";

let mockMapProps: { markers: Array<{ id: string; lat: number; lng: number; title: string }>; onMarkerClick?: (id: string) => void; fitKey: string } | null =
  null;

jest.mock("@/components/maps/free-map", () => ({
  FreeMap: (props: typeof mockMapProps) => {
    mockMapProps = props;
    return <div data-map />;
  },
}));

beforeEach(() => {
  mockMapProps = null;
  window.history.replaceState(null, "", "/");
});

describe("GettingHere", () => {
  it("shows the three researched routes, word for word", () => {
    render(<GettingHere />);

    GETTING_HERE.forEach((card) => {
      expect(screen.getByRole("heading", { level: 3, name: card.title })).toBeInTheDocument();
      expect(screen.getByText(card.text)).toBeInTheDocument();
    });
  });

  it("ends with the check-before-you-travel line", () => {
    render(<GettingHere />);

    expect(screen.getByText(GETTING_HERE_CHECK)).toBeInTheDocument();
  });

  it("links every source it was researched from, in a new tab", () => {
    render(<GettingHere />);

    GETTING_HERE_SOURCES.forEach((source) => {
      const link = screen.getByRole("link", { name: source.label });
      expect(link).toHaveAttribute("href", source.href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
    });
  });

  it("states no fares or departure times as fact", () => {
    render(<GettingHere />);
    const copy = GETTING_HERE.map((card) => card.text).join(" ");

    expect(copy).not.toMatch(/₱|\bPHP\b|\bpesos\b/);
    expect(copy).not.toMatch(/\b\d{1,2}:\d{2}\b/);
  });
});

describe("TripCard", () => {
  const trip = {
    id: "pkg-1",
    title: "Calaguas Island Day Trip",
    locationName: "Vinzons",
    duration: "3 days",
    price: 3799,
    perPerson: true,
    operator: "Bagasbas Coast Tours",
  };

  it("says how long, how much and who runs it", () => {
    render(<TripCard trip={trip} />);

    expect(screen.getByRole("heading", { level: 3, name: trip.title })).toBeInTheDocument();
    expect(screen.getByText("3 days · from ₱3,799.00 per person")).toBeInTheDocument();
    expect(screen.getByText("Run by Bagasbas Coast Tours")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/tours/packages/pkg-1");
  });

  it("says for the trip when the price is flat, and drops the price when there is none", () => {
    const { rerender } = render(<TripCard trip={{ ...trip, perPerson: false }} />);
    expect(screen.getByText("3 days · from ₱3,799.00 for the trip")).toBeInTheDocument();

    rerender(<TripCard trip={{ ...trip, price: null }} />);
    expect(screen.getByText("3 days")).toBeInTheDocument();
    expect(screen.queryByText(/from/)).not.toBeInTheDocument();
  });

  it("uses the place name, not a photo, and says nothing it was not told", () => {
    render(<TripCard trip={{ ...trip, operator: null }} />);

    expect(screen.getByText("Vinzons")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText(/Run by/)).not.toBeInTheDocument();
  });
});

describe("HomeMap", () => {
  const places: MapPlace[] = [
    { slug: "bagasbas-beach", name: "Bagasbas Beach", lat: 14.1155, lng: 122.9685 },
    { slug: "first-rizal-monument", name: "First Rizal Monument", lat: 14.1131, lng: 122.9545 },
  ];

  it("pins every place it is given, and frames them together", () => {
    render(<HomeMap places={places} />);

    expect(mockMapProps?.markers.map((marker) => marker.id)).toEqual(["bagasbas-beach", "first-rizal-monument"]);
    expect(mockMapProps?.markers[0]).toMatchObject({ lat: 14.1155, lng: 122.9685, title: "Bagasbas Beach" });
    expect(mockMapProps?.fitKey).toContain("bagasbas-beach:14.1155,122.9685");
  });

  it("holds the map back until the section is nearly on screen", () => {
    const seen: IntersectionObserverCallback[] = [];
    class FakeObserver {
      constructor(callback: IntersectionObserverCallback) {
        seen.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(global, "IntersectionObserver", { configurable: true, writable: true, value: FakeObserver });

    try {
      render(<HomeMap places={places} />);
      expect(mockMapProps).toBeNull();

      act(() => {
        seen[0]([{ isIntersecting: true }] as unknown as IntersectionObserverEntry[], {} as IntersectionObserver);
      });

      expect(mockMapProps).not.toBeNull();
    } finally {
      Object.defineProperty(global, "IntersectionObserver", { configurable: true, writable: true, value: undefined });
    }
  });

  it("opens the tapped place in the fan and takes the page back up to it", () => {
    const scrollTo = jest.fn();
    Object.defineProperty(window, "scrollTo", { configurable: true, writable: true, value: scrollTo });
    render(<HomeMap places={places} />);

    mockMapProps?.onMarkerClick?.("first-rizal-monument");

    expect(window.location.hash).toBe("#place-first-rizal-monument");
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });
});

describe("AskBand", () => {
  it("asks the assistant to open", () => {
    const opened = jest.fn();
    window.addEventListener("daet:open-assistant", opened);
    render(<AskBand />);

    fireEvent.click(screen.getByRole("button", { name: "Ask what to do in one day" }));

    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener("daet:open-assistant", opened);
  });
});
