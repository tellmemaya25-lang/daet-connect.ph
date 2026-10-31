/** @jest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import { FreeMap } from "@/components/maps/free-map";
import type { FreeMapMarker } from "@/components/maps/map-types";

jest.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}), { virtual: true });

const mockState: {
  fail: "constructor" | "style" | null;
  styles: string[];
  camera: Array<[string, unknown]>;
  markerEls: HTMLElement[];
  anchors: Array<string | undefined>;
  map: { emit: (event: string) => void } | null;
} = { fail: null, styles: [], camera: [], markerEls: [], anchors: [], map: null };

// maplibre-gl ships ESM only (no "require" export), so Jest gets a stand-in.
jest.mock("maplibre-gl", () => {
  class MockMap {
    handlers: Record<string, Array<() => void>> = {};
    constructor(options: { style: string }) {
      if (mockState.fail === "constructor") throw new Error("no WebGL");
      mockState.styles.push(options.style);
      mockState.map = this;
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
    getZoom() {
      return 12;
    }
    jumpTo(options: unknown) {
      mockState.camera.push(["jumpTo", options]);
    }
    flyTo(options: unknown) {
      mockState.camera.push(["flyTo", options]);
    }
    easeTo(options: unknown) {
      mockState.camera.push(["easeTo", options]);
    }
    fitBounds(_bounds: unknown, options: unknown) {
      mockState.camera.push(["fitBounds", options]);
    }
    remove() {
      this.emit("remove");
    }
  }
  class MockMarker {
    constructor(options: { element: HTMLElement; anchor?: string }) {
      mockState.markerEls.push(options.element);
      mockState.anchors.push(options.anchor);
    }
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
  mockState.camera = [];
  mockState.markerEls = [];
  mockState.anchors = [];
  mockState.map = null;
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

  it("pulls back and flies to the focused stop, then drifts closer until the viewer moves the map", async () => {
    const { rerender } = render(<FreeMap markers={markers} title="Route map" labels onMarkerClick={() => {}} />);
    await waitFor(() => expect(mockState.markerEls).toHaveLength(2));
    rerender(<FreeMap markers={markers} title="Route map" labels focusId="b" onMarkerClick={() => {}} />);
    await waitFor(() => expect(mockState.camera.some(([kind]) => kind === "flyTo")).toBe(true));
    expect(mockState.camera.find(([kind]) => kind === "flyTo")?.[1]).toMatchObject({ center: [122.9851, 14.1316], zoom: 15.5, curve: 1.9, speed: 0.9 });
    // The flight lands: a slow push in follows.
    mockState.map!.emit("moveend");
    expect(mockState.camera.at(-1)).toEqual(["easeTo", expect.objectContaining({ zoom: 12.6, duration: 5000 })]);

    // A new focus whose flight the viewer interrupts by dragging: no drift after it.
    rerender(<FreeMap markers={markers} title="Route map" labels focusId="a" onMarkerClick={() => {}} />);
    await waitFor(() => expect(mockState.camera.filter(([kind]) => kind === "flyTo")).toHaveLength(2));
    mockState.map!.emit("dragstart");
    const before = mockState.camera.length;
    mockState.map!.emit("moveend");
    expect(mockState.camera.slice(before).some(([kind]) => kind === "easeTo")).toBe(false);
  });

  it("labels stops with their name and kind, and draws the picked one as a pin", async () => {
    const labelled = markers.map((m) => (m.id === "b" ? { ...m, subtitle: "Beach" } : m));
    const { rerender } = render(<FreeMap markers={labelled} title="Route map" labels onMarkerClick={() => {}} />);
    await waitFor(() => expect(mockState.markerEls).toHaveLength(2));
    const beach = mockState.markerEls[1];
    expect(beach.tagName).toBe("BUTTON");
    expect(beach.getAttribute("aria-label")).toBe("Bagasbas Beach");
    expect(beach.textContent).toBe("2Bagasbas BeachBeach");
    expect(mockState.markerEls[0].textContent).toBe("1First José Riza…");
    rerender(<FreeMap markers={labelled} title="Route map" labels focusId="b" onMarkerClick={() => {}} />);
    await waitFor(() => expect(mockState.markerEls.at(-1)?.getAttribute("aria-current")).toBe("true"));
    expect(mockState.anchors.at(-1)).toBe("bottom");
  });

  it("jumps instead of flying when the device asks for less motion", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({ matches: query.includes("reduced-motion"), addEventListener() {}, removeEventListener() {} }),
    });
    const { rerender } = render(<FreeMap markers={markers} title="Route map" />);
    await waitFor(() => expect(mockState.markerEls).toHaveLength(2));
    rerender(<FreeMap markers={markers} title="Route map" focusId="a" />);
    await waitFor(() => expect(mockState.camera.some(([kind]) => kind === "jumpTo")).toBe(true));
    expect(mockState.camera.some(([kind]) => kind === "flyTo")).toBe(false);
  });

  it("draws the sketch when the map can't start", async () => {
    mockState.fail = "constructor";
    render(<FreeMap markers={markers} title="Route map" />);
    await waitFor(() => expect(screen.getByRole("img", { name: "Route map" })).toBeInTheDocument());
  });
});
