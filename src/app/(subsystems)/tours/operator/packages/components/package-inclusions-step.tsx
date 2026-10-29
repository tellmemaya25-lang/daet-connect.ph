"use client";

import { useState } from "react";
import type { PackageDraft } from "../package-types";

interface PackageInclusionsStepProps {
  data: PackageDraft;
  onComplete: (data: Partial<PackageDraft>) => void;
  onBack: () => void;
  loading: boolean;
}

export function PackageInclusionsStep({
  data,
  onComplete,
  onBack,
  loading,
}: PackageInclusionsStepProps) {
  const [inclusions, setInclusions] = useState<string[]>(data.inclusions);
  const [exclusions, setExclusions] = useState<string[]>(data.exclusions);
  const [newInclusion, setNewInclusion] = useState("");
  const [newExclusion, setNewExclusion] = useState("");

  const addInclusion = () => {
    if (newInclusion.trim()) {
      setInclusions([...inclusions, newInclusion.trim()]);
      setNewInclusion("");
    }
  };

  const removeInclusion = (index: number) => {
    setInclusions(inclusions.filter((_, i) => i !== index));
  };

  const addExclusion = () => {
    if (newExclusion.trim()) {
      setExclusions([...exclusions, newExclusion.trim()]);
      setNewExclusion("");
    }
  };

  const removeExclusion = (index: number) => {
    setExclusions(exclusions.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete({ inclusions, exclusions });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-daet-ink">What's included?</h2>
        <p className="mt-2 text-sm text-daet-ink/65">
          Help tourists know exactly what they're getting — list what's included and what's not.
        </p>
      </div>

      {/* Inclusions */}
      <div>
        <label className="block text-sm font-bold text-daet-ink">Inclusions</label>
        <p className="mt-1 text-xs text-daet-ink/70">
          What's provided in this tour package?
        </p>

        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={newInclusion}
            onChange={(e) => setNewInclusion(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addInclusion())}
            placeholder="e.g., Transportation, Lunch, Tour guide"
            maxLength={200}
            className="flex-1 rounded-full border border-daet-ink/15 bg-white px-4 py-2.5 text-sm outline-none transition placeholder:text-daet-ink/35 focus:border-daet-forest focus:ring-4 focus:ring-daet-forest/10"
          />
          <button
            type="button"
            onClick={addInclusion}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-daet-forest/10 px-5 text-sm font-bold text-daet-leaf transition hover:bg-daet-forest/20"
          >
            Add
          </button>
        </div>

        {inclusions.length > 0 && (
          <ul className="mt-3 space-y-2">
            {inclusions.map((item, index) => (
              <li
                key={index}
                className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm"
              >
                <span className="flex items-center gap-2 text-emerald-900">
                  <span className="text-base" aria-hidden="true">
                    ✓
                  </span>
                  {item}
                </span>
                <button
                  type="button"
                  onClick={() => removeInclusion(index)}
                  className="text-emerald-700 hover:text-emerald-900"
                  aria-label="Remove inclusion"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Exclusions */}
      <div>
        <label className="block text-sm font-bold text-daet-ink">Exclusions</label>
        <p className="mt-1 text-xs text-daet-ink/70">
          What should tourists prepare or pay for separately?
        </p>

        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={newExclusion}
            onChange={(e) => setNewExclusion(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addExclusion())}
            placeholder="e.g., Personal expenses, Travel insurance"
            maxLength={200}
            className="flex-1 rounded-full border border-daet-ink/15 bg-white px-4 py-2.5 text-sm outline-none transition placeholder:text-daet-ink/35 focus:border-daet-forest focus:ring-4 focus:ring-daet-forest/10"
          />
          <button
            type="button"
            onClick={addExclusion}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-daet-ink/10 px-5 text-sm font-bold text-daet-ink transition hover:bg-daet-ink/20"
          >
            Add
          </button>
        </div>

        {exclusions.length > 0 && (
          <ul className="mt-3 space-y-2">
            {exclusions.map((item, index) => (
              <li
                key={index}
                className="flex items-center justify-between gap-3 rounded-2xl border border-daet-ink/10 bg-daet-sand px-4 py-3 text-sm"
              >
                <span className="flex items-center gap-2 text-daet-ink/70">
                  <span className="text-base" aria-hidden="true">
                    ✕
                  </span>
                  {item}
                </span>
                <button
                  type="button"
                  onClick={() => removeExclusion(index)}
                  className="text-daet-ink/70 hover:text-daet-ink"
                  aria-label="Remove exclusion"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-between gap-3 border-t border-daet-ink/10 pt-6">
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-daet-ink/20 px-8 text-sm font-bold text-daet-ink transition hover:bg-daet-sand disabled:cursor-not-allowed disabled:opacity-50"
        >
          ← Back
        </button>
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
