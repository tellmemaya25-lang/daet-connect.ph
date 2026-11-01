/** @jest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { useFileDrop } from "./use-file-drop";

/** A minimal DataTransfer stand-in: only the fields the hook reads. */
const dragEvent = (types: string[], files: File[] = []) =>
  ({
    preventDefault: jest.fn(),
    dataTransfer: { types, files, dropEffect: "" },
  }) as unknown as React.DragEvent;

const photo = (name = "cover.jpg") => new File(["x"], name, { type: "image/jpeg" });

describe("useFileDrop", () => {
  it("hands a dropped photo to onFile and cancels the browser's own handling", () => {
    const onFile = jest.fn();
    const { result } = renderHook(() => useFileDrop({ onFile }));

    const file = photo();
    const drop = dragEvent(["Files"], [file]);

    act(() => result.current.dropProps.onDrop(drop));

    expect(onFile).toHaveBeenCalledWith(file);
    expect(drop.preventDefault).toHaveBeenCalled();
    expect(result.current.isDragging).toBe(false);
  });

  it("highlights the region while a file is over it", () => {
    const { result } = renderHook(() => useFileDrop({ onFile: jest.fn() }));

    act(() => result.current.dropProps.onDragEnter(dragEvent(["Files"])));
    expect(result.current.isDragging).toBe(true);
  });

  it("ignores drags that are not files, so internal reordering still works", () => {
    const onFile = jest.fn();
    const { result } = renderHook(() => useFileDrop({ onFile }));
    const internal = dragEvent(["text/plain"]);

    act(() => result.current.dropProps.onDragEnter(internal));
    act(() => result.current.dropProps.onDrop(internal));

    expect(result.current.isDragging).toBe(false);
    expect(onFile).not.toHaveBeenCalled();
    expect(internal.preventDefault).not.toHaveBeenCalled();
  });

  it("keeps the highlight steady while the pointer crosses child elements", () => {
    const { result } = renderHook(() => useFileDrop({ onFile: jest.fn() }));

    act(() => result.current.dropProps.onDragEnter(dragEvent(["Files"])));
    act(() => result.current.dropProps.onDragEnter(dragEvent(["Files"])));
    act(() => result.current.dropProps.onDragLeave(dragEvent(["Files"])));
    expect(result.current.isDragging).toBe(true);

    act(() => result.current.dropProps.onDragLeave(dragEvent(["Files"])));
    expect(result.current.isDragging).toBe(false);
  });

  it("still blocks the browser opening the file when drops are disabled", () => {
    const onFile = jest.fn();
    const { result } = renderHook(() => useFileDrop({ onFile, enabled: false }));
    const drop = dragEvent(["Files"], [photo()]);

    act(() => result.current.dropProps.onDrop(drop));

    expect(onFile).not.toHaveBeenCalled();
    expect(drop.preventDefault).toHaveBeenCalled();
  });

  it("does nothing when the drop carries no file", () => {
    const onFile = jest.fn();
    const { result } = renderHook(() => useFileDrop({ onFile }));

    act(() => result.current.dropProps.onDrop(dragEvent(["Files"])));

    expect(onFile).not.toHaveBeenCalled();
  });
});
