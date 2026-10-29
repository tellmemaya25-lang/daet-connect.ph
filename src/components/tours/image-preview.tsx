'use client';

import { useState } from 'react';
import Image from 'next/image';

interface ImagePreviewProps {
  images: Array<{
    id?: string;
    url: string;
    caption?: string;
  }>;
  onDelete?: (index: number) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  editable?: boolean;
}

export function ImagePreview({
  images,
  onDelete,
  onReorder,
  editable = true,
}: ImagePreviewProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    if (onReorder) {
      onReorder(draggedIndex, index);
      setDraggedIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  if (images.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {images.map((image, index) => (
        <div
          key={image.id || index}
          draggable={editable}
          onDragStart={() => handleDragStart(index)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDragEnd={handleDragEnd}
          className={`
            relative aspect-video rounded-2xl overflow-hidden border-2 
            ${draggedIndex === index ? 'opacity-50 border-daet-forest' : 'border-daet-ink/20'}
            ${editable ? 'cursor-move' : ''}
          `}
        >
          <img
            src={image.url}
            alt={image.caption || `Image ${index + 1}`}
            className="w-full h-full object-cover"
          />

          {editable && onDelete && (
            <button
              onClick={() => onDelete(index)}
              className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1.5 hover:bg-red-700 transition-colors shadow-[var(--shadow-float)]"
              title="Delete image"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}

          {editable && (
            <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
              {index + 1}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
