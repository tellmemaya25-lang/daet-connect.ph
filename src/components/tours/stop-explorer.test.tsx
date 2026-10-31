/** @jest-environment jsdom */

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { StopExplorer } from "@/components/tours/stop-explorer";
import type { StopDetail } from "@/lib/tours/stop-details";

// The map itself is tested in free-map.test.tsx; here it records what it was asked to do.
const mapProps: { focusId?: string | null; fitKey?: string; onMarkerClick?: (id: string) => void; markers?: Array<{ id: string; label: string }> } = {};
jest.mock("@/components/maps/free-map", () => ({
  FreeMap: (props: typeof mapProps) => {
    Object.assign(mapProps, props);
    return <div data-testid="map" />;
  },
}));

const stops: StopDetail[] = [
  { id: "s1", name: "First José Rizal Monument", description: "Raised in 1898.", lat: 14.1131, lng: 122.9545, photo: { src: "/photos/rizal-monument.jpg", alt: "The Rizal monument" }, href: "/tours/attractions/first-rizal-monument" },
  { id: "s2", name: "Lunch stop", description: "x".repeat(300), lat: null, lng: null, photo: null, href: null },
  { id: "s3", name: "Bagasbas Beach", description: null, lat: 14.1316, lng: 122.9851, photo: null, href: null },
];
const legs = [{ distanceM: 4200, durationS: 600, polyline: null, estimated: true }];

const toggle = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });

beforeEach(() => {
  for (const key of Object.keys(mapProps)) delete (mapProps as Record<string, unknown>)[key];
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  Element.prototype.scrollIntoView = jest.fn();
});

describe("StopExplorer", () => {
  it("lists the start and every stop, numbering pins by their place in the list", () => {
    render(<StopExplorer stops={stops} legs={legs} meetingPoint="Rizal Park, 6:00 AM" title="Route map" />);
    expect(screen.getByText("Rizal Park, 6:00 AM")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(mapProps.markers?.map((m) => [m.id, m.label])).toEqual([
      ["s1", "1"],
      ["s3", "3"],
    ]);
    expect(toggle("First José Rizal Monument")).toHaveTextContent("About 10 min (4.2 km) to the next stop");
  });

  it("opens one stop at a time and flies the map to it", () => {
    render(<StopExplorer stops={stops} legs={legs} meetingPoint="Rizal Park" title="Route map" />);
    expect(mapProps.focusId).toBeNull();
    fireEvent.click(toggle("First José Rizal Monument"));
    expect(toggle("First José Rizal Monument")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("img", { name: "The Rizal monument" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "More about First José Rizal Monument" })).toHaveAttribute("href", "/tours/attractions/first-rizal-monument");
    expect(mapProps.focusId).toBe("s1");
    expect(screen.getByText(/Viewing/)).toHaveTextContent("Viewing First José Rizal Monument");

    fireEvent.click(toggle("Bagasbas Beach"));
    expect(toggle("First José Rizal Monument")).toHaveAttribute("aria-expanded", "false");
    expect(mapProps.focusId).toBe("s3");
    expect(screen.getByText("Stop 3 of 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "See less" }));
    expect(toggle("Bagasbas Beach")).toHaveAttribute("aria-expanded", "false");
    expect(mapProps.focusId).toBeNull();
  });

  it("opens a stop without a pin in the list only, and clamps long text behind Read more", () => {
    render(<StopExplorer stops={stops} legs={legs} meetingPoint="Rizal Park" title="Route map" />);
    fireEvent.click(toggle("Lunch stop"));
    expect(mapProps.focusId).toBeNull();
    expect(screen.getByText(/no map pin for this stop/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Read more" }));
    expect(screen.getByRole("button", { name: "Read less" })).toBeInTheDocument();
  });

  it("steps through stops with previous and next, wrapping at the ends", () => {
    render(<StopExplorer stops={stops} legs={legs} meetingPoint="Rizal Park" title="Route map" />);
    fireEvent.click(screen.getByRole("button", { name: "Next stop" }));
    expect(mapProps.focusId).toBe("s1");
    fireEvent.click(screen.getByRole("button", { name: "Previous stop" }));
    expect(toggle("Bagasbas Beach")).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Next stop" }));
    expect(mapProps.focusId).toBe("s1");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("opens the stop for a tapped pin, and Show all closes it and reframes", () => {
    render(<StopExplorer stops={stops} legs={legs} meetingPoint="Rizal Park" title="Route map" />);
    const fit = mapProps.fitKey;
    act(() => mapProps.onMarkerClick?.("s3"));
    expect(screen.getByText(/Viewing/)).toHaveTextContent("Viewing Bagasbas Beach");
    fireEvent.click(screen.getByRole("button", { name: "Show all stops" }));
    expect(toggle("Bagasbas Beach")).toHaveAttribute("aria-expanded", "false");
    expect(mapProps.fitKey).not.toBe(fit);
    expect(screen.queryByText(/Viewing/)).toBeNull();
  });

  it("closes from the map chip", () => {
    render(<StopExplorer stops={stops} legs={legs} meetingPoint="Rizal Park" title="Route map" />);
    fireEvent.click(toggle("First José Rizal Monument"));
    const chip = screen.getByText(/Viewing/).parentElement!;
    fireEvent.click(within(chip).getByRole("button", { name: "Close First José Rizal Monument" }));
    expect(mapProps.focusId).toBeNull();
  });
});
