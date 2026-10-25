'use client';

import { useId, useRef, useState } from 'react';

interface ImageUploaderProps {
  onUpload: (files: File[]) => void;
  maxFiles?: number;
  accept?: string;
  multiple?: boolean;
  label?: string;
  description?: string;
  /** Largest allowed file, in megabytes. */
  maxSizeMb?: number;
}

/**
 * Drop zone and file picker. The real file input stays in the tab order (it is
 * only visually hidden), so keyboard and screen reader users can open the
 * picker, and files that are rejected are listed instead of silently dropped.
 */
export function ImageUploader({
  onUpload,
  maxFiles = 5,
  accept = 'image/jpeg,image/jpg,image/png,image/webp',
  multiple = true,
  label = 'Upload images',
  description = 'PNG, JPG or WebP, up to 5 MB each',
  maxSizeMb = 5,
}: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const helpId = useId();
  const errorId = useId();

  const accept_ = (incoming: File[]) => {
    const issues: string[] = [];
    const ok: File[] = [];
    for (const file of incoming) {
      if (!file.type.startsWith('image/')) {
        issues.push(`${file.name} is not an image, so it was skipped.`);
      } else if (file.size > maxSizeMb * 1024 * 1024) {
        issues.push(`${file.name} is larger than ${maxSizeMb} MB, so it was skipped.`);
      } else {
        ok.push(file);
      }
    }
    if (ok.length > maxFiles) {
      issues.push(`Only the first ${maxFiles} ${maxFiles === 1 ? 'file was' : 'files were'} added.`);
    }
    setProblems(issues);
    if (ok.length > 0) onUpload(ok.slice(0, maxFiles));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    accept_(Array.from(e.dataTransfer.files));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    accept_(e.target.files ? Array.from(e.target.files) : []);
    // Reset so choosing the same file again still fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={handleDrop}
        className={`block cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-daet-forest sm:p-8 ${
          isDragging ? 'border-daet-forest bg-daet-sand' : 'border-daet-ink/25 bg-white hover:border-daet-forest/60'
        }`}
      >
        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleFileSelect}
          aria-describedby={problems.length > 0 ? `${helpId} ${errorId}` : helpId}
          className="sr-only"
        />
        <span className="block text-base font-black text-daet-ink">{label}</span>
        <span className="mt-1 block text-sm font-semibold text-daet-forest underline underline-offset-4">
          Choose {multiple ? 'files' : 'a file'} or drop {multiple ? 'them' : 'it'} here
        </span>
        <span id={helpId} className="mt-2 block text-sm text-daet-ink/70">
          {description}
          {multiple ? `. Up to ${maxFiles} ${maxFiles === 1 ? 'file' : 'files'}.` : ''}
        </span>
      </label>
      {problems.length > 0 ? (
        <ul id={errorId} role="alert" className="mt-2 space-y-1 text-sm font-semibold text-rose-700">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
