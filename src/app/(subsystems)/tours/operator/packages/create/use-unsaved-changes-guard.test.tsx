/** @jest-environment jsdom */

import React from "react";
import { render } from "@testing-library/react";
import { useUnsavedChangesGuard } from "./use-unsaved-changes-guard";

function Guarded({ dirty }: { dirty: boolean }) {
  useUnsavedChangesGuard(dirty);
  return <p>form</p>;
}

function fireBeforeUnload() {
  const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent & { returnValue: unknown };
  window.dispatchEvent(event);
  return event;
}

describe("useUnsavedChangesGuard", () => {
  it("asks the browser to confirm when work is unsaved", () => {
    render(<Guarded dirty />);

    const event = fireBeforeUnload();

    expect(event.defaultPrevented).toBe(true);
  });

  it("stays out of the way when everything is saved", () => {
    render(<Guarded dirty={false} />);

    const event = fireBeforeUnload();

    expect(event.defaultPrevented).toBe(false);
  });

  it("removes the listener when the form unmounts", () => {
    const { unmount } = render(<Guarded dirty />);
    unmount();

    expect(fireBeforeUnload().defaultPrevented).toBe(false);
  });
});
