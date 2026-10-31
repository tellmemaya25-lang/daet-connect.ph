/** @jest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import { FreeMap } from "@/components/maps/free-map";
import type { FreeMapMarker } from "@/components/maps/map-types";

jest.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}), { virtual: true });

const mockState: { fail: "constructor" | "style" | null; styles: string[] } = { fail: null, styles: [] };

// maplibre-gl ships ESM only (no "require" export), so Jest gets a stand-in.
jest.mock("maplibre-gl", () => {
  class MockMap {
    handlers: Record<string, Array<() => void>> = {};
    constructor(options: { style: string }) {
      if (mockState.fail === "constructor") throw new Error("no WebGL");
      mockState.styles.push(options.style);
      setTimeout(() => this.emit(mockState.fail === "style" ? "error" : "style.load"), 0);
    }
    on(event: string, fn: () => void) {
      (this.handlers[event] ??= []).push(fn);
      return this;
    }
    once(event: string, fn: () => void) {
      return this.on(event, fn);
    }
    emit(event: string) {
      (this.handlers[event] ?? []).forEach((fn) => fn());
    }
    setStyle(style: string) {
      mockState.styles.push(style);
      setTimeout(() => this.emit(mockState.fail === "style" ? "error" : "style.load"), 0);
    }
    addControl() {}
    getSource() {
      return undefined;
    }
    addSource() {}
    addLayer() {}
    jumpTo() {}
    fitBounds() {}
    remove() {
      this.emit("remove");
    }
  }
  class MockMarker {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  }
  return { Map: MockMap, Marker: MockMarker, NavigationControl: class {}, setWorkerUrl: jest.fn(), getVersion: () => "0.0.0" };
}, { virtual: true });

const markers: FreeMapMarker[] = [
  { id: "a", lat: 14.1131, lng: 122.9545, kind: "stop", label: "1", title: "First José Rizal Monument" },
  { id: "b", lat: 14.1316, lng: 122.9851, kind: "stop", label: "2", title: "Bagasbas Beach" },
];

beforeEach(() => {
  mockState.fail = null;
  mockState.styles = [];
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  document.documentElement.removeAttribute("data-theme");
});

describe("FreeMap", () => {
  it("shows the tile map and lists the markers for screen readers", async () => {
    render(<FreeMap markers={markers} title="Route map" />);
    expect(screen.getByRole("region", { name: "Route map" })).toBeInTheDocument();
    expect(screen.getByText("Bagasbas Beach")).toBeInTheDocument();
    await waitFor(() => expect(mockState.styles).toEqual(["https://tiles.openfreemap.org/styles/positron"]));
  });

  it("uses the dark style on a dark page, and tries the light one if dark fails", async () => {
    document.documentElement.setAttribute("data-theme", "dark");
    mockState.fail = "style";
    render(<FreeMap markers={markers} title="Route map" />);
    await waitFor(() => expect(screen.getByRole("img", { name: "Route map" })).toBeInTheDocument());
    expect(mockState.styles).toEqual(["https://tiles.openfreemap.org/styles/dark", "https://tiles.openfreemap.org/styles/positron"]);
    expect(screen.getByText(/Sketch map/)).toBeInTheDocument();
  });

  it("draws the sketch when the map can't start", async () => {
    mockState.fail = "constructor";
    render(<FreeMap markers={markers} title="Route map" />);
    await waitFor(() => expect(screen.getByRole("img", { name: "Route map" })).toBeInTheDocument());
  });
});
