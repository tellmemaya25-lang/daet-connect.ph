/**
 * @jest-environment jsdom
 */

import React, { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { PlaceDetail } from "./place-detail";
import { FAN_PLACES } from "./fan-places";

const renderDetail = (overrides: Partial<React.ComponentProps<typeof PlaceDetail>> = {}) => {
  const handlers = { onClose: jest.fn(), onPrev: jest.fn(), onNext: jest.fn() };
  const view = render(
    <PlaceDetail
      place={FAN_PLACES[2]}
      index={2}
      total={FAN_PLACES.length}
      phone={false}
      headingRef={createRef<HTMLHeadingElement>()}
      {...handlers}
      {...overrides}
    />,
  );
  return { ...view, ...handlers };
};

const swipe = (element: Element, from: number, to: number) => {
  fireEvent.touchStart(element, { touches: [{ clientY: from }] });
  fireEvent.touchMove(element, { touches: [{ clientY: to }] });
  fireEvent.touchEnd(element, { changedTouches: [{ clientY: to }] });
};

describe("PlaceDetail", () => {
  it("names the place, its position in the fan and the owner's copy", () => {
    renderDetail();

    expect(screen.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeInTheDocument();
    expect(screen.getByText("3 of 6")).toBeInTheDocument();
    expect(screen.getByText("Beach")).toBeInTheDocument();
    expect(screen.getByText(FAN_PLACES[2].text)).toBeInTheDocument();
  });

  it("links to the place page and to the trips near it", () => {
    renderDetail();

    expect(screen.getByRole("link", { name: "See the place" })).toHaveAttribute("href", FAN_PLACES[2].href);
    expect(screen.getByRole("link", { name: "Trips near here" })).toHaveAttribute("href", FAN_PLACES[2].toursHref);
  });

  it("reports the close and step buttons to the handlers", () => {
    const { onClose, onPrev, onNext } = renderDetail();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous place" }));
    fireEvent.click(screen.getByRole("button", { name: "Next place" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("uses 48px targets for close and the arrows", () => {
    renderDetail();

    ["Close", "Previous place", "Next place"].forEach((name) => {
      expect(screen.getByRole("button", { name })).toHaveClass("h-12", "w-12");
    });
  });

  it("floats the ✕ and the arrows over the photo, clear of the card", () => {
    const { container } = renderDetail();
    const card = container.querySelector("[data-detail]") as HTMLElement;

    // As in the mock: the card holds the words and the two ways on, while the ✕
    // sits over the photo's top right corner and the ‹ › over its bottom right.
    expect(card).not.toContainElement(screen.getByRole("button", { name: "Close" }));
    expect(card).not.toContainElement(screen.getByRole("button", { name: "Previous place" }));
    expect(card).not.toContainElement(screen.getByRole("button", { name: "Next place" }));
    expect(screen.getByRole("heading", { level: 2, name: "Bagasbas Beach" })).toBeInTheDocument();
  });

  it("keeps the arrows with the sheet on a phone, where there is no room beside it", () => {
    const { container } = renderDetail({ phone: true });
    const sheet = container.querySelector("[data-detail]") as HTMLElement;

    expect(sheet).toContainElement(screen.getByRole("button", { name: "Next place" }));
    expect(sheet).toContainElement(screen.getByRole("button", { name: "Previous place" }));
    expect(sheet).not.toContainElement(screen.getByRole("button", { name: "Close" }));
  });

  it("makes the sheet follow a finger on a phone and dismiss on a long drag", () => {
    const { container, onClose } = renderDetail({ phone: true });
    const sheet = container.querySelector("[data-detail]") as HTMLElement;

    fireEvent.touchStart(sheet, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(sheet, { touches: [{ clientY: 160 }] });
    expect(sheet.style.transform).toBe("translateY(60px)");

    fireEvent.touchEnd(sheet, { changedTouches: [{ clientY: 240 }] });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("springs back when the drag is short", () => {
    const { container, onClose } = renderDetail({ phone: true });
    const sheet = container.querySelector("[data-detail]") as HTMLElement;

    swipe(sheet, 100, 140);

    expect(onClose).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe("");
  });

  it("ignores a drag on the desktop panel", () => {
    const { container, onClose } = renderDetail();
    const panel = container.querySelector("[data-detail]") as HTMLElement;

    swipe(panel, 100, 300);

    expect(onClose).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe("");
  });
});
