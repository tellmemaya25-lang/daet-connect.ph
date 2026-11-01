/** @jest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { useSortableList } from "./use-sortable-list";

const dragEvent = (types: string[] = []) =>
  ({
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
    dataTransfer: {
      types,
      dropEffect: "",
      effectAllowed: "",
      setData: jest.fn(),
    },
  }) as unknown as React.DragEvent;

describe("useSortableList", () => {
  it("moves a card to the position it is dropped on", () => {
    const onMove = jest.fn();
    const { result } = renderHook(() => useSortableList({ onMove }));

    act(() => result.current.getItemProps(0).onDragStart(dragEvent()));
    act(() => result.current.getItemProps(2).onDragOver(dragEvent()));
    act(() => result.current.getItemProps(2).onDrop(dragEvent()));

    expect(onMove).toHaveBeenCalledWith(0, 2);
    expect(result.current.draggingIndex).toBeNull();
    expect(result.current.overIndex).toBeNull();
  });

  it("does nothing when a card is dropped on itself", () => {
    const onMove = jest.fn();
    const { result } = renderHook(() => useSortableList({ onMove }));

    act(() => result.current.getItemProps(1).onDragStart(dragEvent()));
    act(() => result.current.getItemProps(1).onDrop(dragEvent()));

    expect(onMove).not.toHaveBeenCalled();
  });

  it("ignores a photo dragged in from the desktop, so it uploads instead", () => {
    const onMove = jest.fn();
    const { result } = renderHook(() => useSortableList({ onMove }));

    act(() => result.current.getItemProps(0).onDragStart(dragEvent()));
    const fileDrag = dragEvent(["Files"]);

    act(() => result.current.getItemProps(2).onDragOver(fileDrag));
    act(() => result.current.getItemProps(2).onDrop(fileDrag));

    expect(onMove).not.toHaveBeenCalled();
    expect(fileDrag.preventDefault).not.toHaveBeenCalled();
    expect(result.current.overIndex).toBeNull();
  });

  it("tracks the card being hovered and clears it when the drag ends", () => {
    const { result } = renderHook(() => useSortableList({ onMove: jest.fn() }));

    act(() => result.current.getItemProps(0).onDragStart(dragEvent()));
    act(() => result.current.getItemProps(3).onDragOver(dragEvent()));
    expect(result.current.overIndex).toBe(3);

    act(() => result.current.getItemProps(0).onDragEnd());
    expect(result.current.overIndex).toBeNull();
    expect(result.current.draggingIndex).toBeNull();
  });

  it("is not draggable when reordering is not allowed", () => {
    const onMove = jest.fn();
    const { result } = renderHook(() => useSortableList({ onMove, enabled: false }));

    expect(result.current.getItemProps(0).draggable).toBe(false);

    act(() => result.current.getItemProps(0).onDragStart(dragEvent()));
    act(() => result.current.getItemProps(1).onDrop(dragEvent()));

    expect(onMove).not.toHaveBeenCalled();
  });
});
