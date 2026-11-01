"use client";

import { useCallback, useState } from "react";
import type React from "react";

/**
 * Drag-to-reorder for a list of cards.
 *
 * Mouse only, by nature: the arrow buttons beside every card stay in place so
 * keyboard and touch users can still move an item. Both paths end in the same
 * `onMove`, which is what keeps the numbering sequential.
 */
export function useSortableList({
  onMove,
  enabled = true,
}: {
  onMove: (from: number, to: number) => void;
  enabled?: boolean;
}) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const reset = useCallback(() => {
    setDraggingIndex(null);
    setOverIndex(null);
  }, []);

  const carriesFile = (event: React.DragEvent) =>
    Array.from(event.dataTransfer?.types ?? []).includes("Files");

  const getItemProps = useCallback(
    (index: number) => ({
      draggable: enabled,
      onDragStart: (event: React.DragEvent) => {
        if (!enabled) return;
        setDraggingIndex(index);
        event.dataTransfer.effectAllowed = "move";
        // Firefox refuses to start a drag unless something is set as data.
        event.dataTransfer.setData("text/plain", String(index));
      },
      onDragOver: (event: React.DragEvent) => {
        if (!enabled || draggingIndex === null) return;
        // A photo dragged in from the OS is an upload, not a reorder.
        if (carriesFile(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (overIndex !== index) setOverIndex(index);
      },
      onDragLeave: () => {
        setOverIndex((current) => (current === index ? null : current));
      },
      onDrop: (event: React.DragEvent) => {
        if (!enabled || draggingIndex === null) return;
        if (carriesFile(event)) return;
        event.preventDefault();
        event.stopPropagation();
        if (draggingIndex !== index) onMove(draggingIndex, index);
        reset();
      },
      onDragEnd: reset,
    }),
    [enabled, draggingIndex, overIndex, onMove, reset],
  );

  return { draggingIndex, overIndex, getItemProps, reset };
}
