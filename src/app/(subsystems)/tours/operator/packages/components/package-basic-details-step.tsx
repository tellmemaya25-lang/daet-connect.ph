"use client";

import { useState } from "react";
import type { PackageDraft } from "../package-types";

interface PackageBasicDetailsStepProps {
  data: PackageDraft;
  onComplete: (data: Partial<PackageDraft>) => void;
  loading: boolean;
}

export function PackageBasicDetailsStep({
  data,
  onComplete,
  loading,
}: PackageBasicDetailsStepProps) {
  const [title, setTitle] = useState(data.title);
  const [description, setDescription] = useState(data.description || "");
  const [locationName, setLocationName] = useState(data.locationName);
  const [durationValue, setDurationValue] = useState(data.durationValue);
  const [durationType, setDurationType] = useState<"hours" | "days">(data.durationType);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!title.trim()) {
      newErrors.title = "Package title is required";
    } else if (title.length < 5) {
      newErrors.title = "Title must be at least 5 characters";
    }

    if (!locationName.trim()) {
      newErrors.locationName = "Location is required";
    }

    if (durationValue <= 0) {
      newErrors.durationValue = "Duration must be greater than 0";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    onComplete({
      title: title.trim(),
      description: description.trim() || null,
      locationName: locationName.trim(),
      durationValue,
      durationType,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-daet-ink">Basic details</h2>
        <p className="mt-2 text-sm text-daet-ink/65">
          Start with the essentials — name your tour package and describe what makes it special.
        </p>
      </div>

      {/* Package Title */}
      <div>
        <label htmlFor="title" className="block text-sm font-bold text-daet-ink">
          Package title <span className="text-rose-600">*</span>
        </label>
        <input
          type="text"
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Bagasbas Beach Sunset Tour"
          maxLength={160}
          aria-invalid={Boolean(errors.title)}
          className="mt-2 w-full rounded-2xl border border-daet-ink/15 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-daet-ink/35 focus:border-daet-forest focus:ring-4 focus:ring-daet-forest/10 aria-[invalid=true]:border-rose-400"
        />
        {errors.title && (
          <p className="mt-1 text-sm font-semibold text-rose-700">{errors.title}</p>
        )}
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-bold text-daet-ink">
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what tourists will experience on this tour..."
          rows={5}
          maxLength={2000}
          className="mt-2 w-full rounded-2xl border border-daet-ink/15 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-daet-ink/35 focus:border-daet-forest focus:ring-4 focus:ring-daet-forest/10"
        />
        <p className="mt-1 text-xs text-daet-ink/70">
          {description.length}/2000 characters
        </p>
      </div>

      {/* Location */}
      <div>
        <label htmlFor="locationName" className="block text-sm font-bold text-daet-ink">
          Location <span className="text-rose-600">*</span>
        </label>
        <input
          type="text"
          id="locationName"
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          placeholder="e.g., Bagasbas Beach, Daet"
          maxLength={200}
          aria-invalid={Boolean(errors.locationName)}
          className="mt-2 w-full rounded-2xl border border-daet-ink/15 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-daet-ink/35 focus:border-daet-forest focus:ring-4 focus:ring-daet-forest/10 aria-[invalid=true]:border-rose-400"
        />
        {errors.locationName && (
          <p className="mt-1 text-sm font-semibold text-rose-700">{errors.locationName}</p>
        )}
      </div>

      {/* Duration */}
      <div>
        <label className="block text-sm font-bold text-daet-ink">
          Duration <span className="text-rose-600">*</span>
        </label>
        <div className="mt-2 flex gap-3">
          <input
            type="number"
            value={durationValue}
            onChange={(e) => setDurationValue(Number(e.target.value))}
            min={1}
            max={365}
            aria-invalid={Boolean(errors.durationValue)}
            className="w-24 rounded-2xl border border-daet-ink/15 bg-white px-4 py-3 text-sm outline-none transition focus:border-daet-forest focus:ring-4 focus:ring-daet-forest/10 aria-[invalid=true]:border-rose-400"
          />
          <select
            value={durationType}
            onChange={(e) => setDurationType(e.target.value as "hours" | "days")}
            className="flex-1 rounded-2xl border border-daet-ink/15 bg-white px-4 py-3 text-sm outline-none transition focus:border-daet-forest focus:ring-4 focus:ring-daet-forest/10"
          >
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </select>
        </div>
        {errors.durationValue && (
          <p className="mt-1 text-sm font-semibold text-rose-700">{errors.durationValue}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 border-t border-daet-ink/10 pt-6">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-daet-forest px-8 text-sm font-black text-white transition hover:bg-daet-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Saving..." : "Continue →"}
        </button>
      </div>
    </form>
  );
}
