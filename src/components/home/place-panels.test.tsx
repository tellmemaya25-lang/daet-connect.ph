/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { PlacePanels, type PlacePanel } from "@/components/home/place-panels";

const panels: PlacePanel[] = [
  {
    name: "Calaguas",
    text: "White sand on Tinaga Island.",
    icon: "beach",
    href: "/a",
    cta: "See Calaguas",
    photo: { src: "/photos/calaguas-beach.jpg", alt: "Calaguas beach" },
  },
  {
    name: "Mercedes port",
    text: "Boats leave here.",
    icon: "boat",
    href: "/b",
    cta: "Trips from Mercedes",
    photo: { src: "/photos/mercedes-port.jpg", alt: "Boats at the port" },
  },
  {
    name: "Bagasbas Beach",
    text: "Surf at sunrise.",
    icon: "beach",
    href: "/c",
    cta: "See Bagasbas",
    photo: { src: "/photos/bagasbas-beach.jpg", alt: "Bagasbas sand" },
  },
];

// jsdom has no PointerEvent, so pointerType would be lost without this.
class TestPointerEvent extends MouseEvent {
  pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? "";
  }
}
(window as unknown as { PointerEvent: typeof TestPointerEvent }).PointerEvent ??= TestPointerEvent;

const button = (name: string) => screen.getByRole("button", { name });

describe("PlacePanels", () => {
  it("opens the first place by default and keeps the others closed", () => {
    render(<PlacePanels panels={panels} />);
    expect(button("Calaguas")).toHaveAttribute("aria-expanded", "true");
    expect(button("Mercedes port")).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("region", { name: "Calaguas" })).toHaveTextContent("White sand on Tinaga Island.");
  });

  it("opens a place on tap and on mouse hover, but not on touch hover", () => {
    render(<PlacePanels panels={panels} />);
    fireEvent.click(button("Bagasbas Beach"));
    expect(button("Bagasbas Beach")).toHaveAttribute("aria-expanded", "true");
    expect(button("Calaguas")).toHaveAttribute("aria-expanded", "false");

    const portItem = button("Mercedes port").closest("li")!;
    fireEvent.pointerEnter(portItem, { pointerType: "touch" });
    expect(button("Mercedes port")).toHaveAttribute("aria-expanded", "false");
    fireEvent.pointerEnter(portItem, { pointerType: "mouse" });
    expect(button("Mercedes port")).toHaveAttribute("aria-expanded", "true");
  });

  it("moves between places with the arrow keys, wrapping at the ends", () => {
    render(<PlacePanels panels={panels} />);
    button("Calaguas").focus();
    fireEvent.keyDown(button("Calaguas"), { key: "ArrowRight" });
    expect(button("Mercedes port")).toHaveFocus();
    expect(button("Mercedes port")).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(button("Mercedes port"), { key: "End" });
    expect(button("Bagasbas Beach")).toHaveFocus();
    fireEvent.keyDown(button("Bagasbas Beach"), { key: "ArrowRight" });
    expect(button("Calaguas")).toHaveFocus();
    fireEvent.keyDown(button("Calaguas"), { key: "ArrowLeft" });
    expect(button("Bagasbas Beach")).toHaveFocus();
  });

  it("makes closed places inert, so only the open place's link is in reach", () => {
    render(<PlacePanels panels={panels} />);
    const region = (name: string) => document.getElementById(button(name).getAttribute("aria-controls")!)!;
    expect(region("Calaguas")).not.toHaveAttribute("inert");
    expect(region("Bagasbas Beach")).toHaveAttribute("inert");
    expect(region("Calaguas").querySelector("a")).toHaveAttribute("href", "/a");
    fireEvent.click(button("Bagasbas Beach"));
    expect(region("Bagasbas Beach")).not.toHaveAttribute("inert");
    expect(region("Calaguas")).toHaveAttribute("inert");
  });
});
