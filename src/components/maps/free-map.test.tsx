/** @jest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import { FreeMap } from "@/components/maps/free-map";
import type { FreeMapMarker } from "@/components/maps/map-types";

jest.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}), { virtual: true });

const mockState: {
  fail: "constructor" | "style" | null;
  styles: string[];
  camera: Array<[string, unknown]>;
  popups: Array<{ content: HTMLElement | null; removed: boolean; fireClose: () => void }>;
  markerEls: HTMLElement[];
} = { fail: null, styles: [], camera: [], popups: [], markerEls: [] };

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
    constructor(options: { element: HTMLElement }) {
      mockState.markerEls.push(options.element);
    }
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  }
  class MockPopup {
    record = { content: null as HTMLElement | null, removed: false, fireClose: () => {} };
    closeHandlers: Array<() => void> = [];
    constructor() {
      this.record.fireClose = () => this.closeHandlers.forEach((fn) => fn());
      mockState.popups.push(this.record);
    }
    setLngLat() {
      return this;
    }
    setDOMContent(el: HTMLElement) {
      this.record.content = el;
      return this;
    }
    addTo() {
      return this;
    }
    on(_event: string, fn: () => void) {
      this.closeHandlers.push(fn);
      return this;
    }
    remove() {
      this.record.removed = true;
      this.record.fireClose();
    }
  }
  return { Map: MockMap, Marker: MockMarker, Popup: MockPopup, NavigationControl: class {}, setWorkerUrl: jest.fn(), getVersion: () => "0.0.0" };
}, { virtual: true });

const markers: FreeMapMarker[] = [
  { id: "a", lat: 14.1131, lng: 122.9545, kind: "stop", label: "1", title: "First José Rizal Monument" },
  { id: "b", lat: 14.1316, lng: 122.9851, kind: "stop", label: "2", title: "Bagasbas Beach" },
];

beforeEach(() => {
  mockState.fail = null;
  mockState.styles = [];
  mockState.camera = [];
  mockState.popups = [];
  mockState.markerEls = [];
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

  it("flies to the focused stop, marks it active and opens its popup as plain text", async () => {
    const withDetail = markers.map((m) => (m.id === "b" ? { ...m, detail: { text: "<b>Surf</b> lesson", photo: { src: "/photos/bagasbas-beach.jpg", alt: "Bagasbas sand" } } } : m));
    const onFocusClear = jest.fn();
    const { rerender } = render(<FreeMap markers={withDetail} title="Route map" onMarkerClick={() => {}} onFocusClear={onFocusClear} />);
    await waitFor(() => expect(mockState.markerEls).toHaveLength(2));
    rerender(<FreeMap markers={withDetail} title="Route map" focusId="b" onMarkerClick={() => {}} onFocusClear={onFocusClear} />);
    await waitFor(() => expect(mockState.camera.some(([kind]) => kind === "flyTo")).toBe(true));
    expect(mockState.camera.find(([kind]) => kind === "flyTo")?.[1]).toMatchObject({ center: [122.9851, 14.1316], zoom: 15 });
    const popup = mockState.popups.at(-1)!;
    expect(popup.content?.textContent).toContain("<b>Surf</b> lesson");
    expect(popup.content?.querySelector("b")).toBeNull();
    expect(popup.content?.querySelector("img")?.getAttribute("alt")).toBe("Bagasbas sand");
    const active = mockState.markerEls.at(-1)!;
    expect(active.tagName).toBe("BUTTON");
    expect(active.getAttribute("aria-current")).toBe("true");

    // Moving focus swaps the popup without counting as the viewer closing it.
    rerender(<FreeMap markers={withDetail} title="Route map" focusId="a" onMarkerClick={() => {}} onFocusClear={onFocusClear} />);
    await waitFor(() => expect(popup.removed).toBe(true));
    expect(onFocusClear).not.toHaveBeenCalled();
    // The viewer closing the popup clears the focus.
    mockState.popups.at(-1)!.fireClose();
    expect(onFocusClear).toHaveBeenCalledTimes(1);
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
