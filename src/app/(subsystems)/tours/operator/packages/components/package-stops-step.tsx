"use client";

import { LineIcon } from "@/components/ui/icons";
import { useState } from "react";
import type { PackageDraft, StopDraft } from "../package-types";

interface PackageStopsStepProps {
  data: PackageDraft;
  onComplete: (data: Partial<PackageDraft>) => void;
  onBack: () => void;
  loading: boolean;
}

export function PackageStopsStep({
  data,
  onComplete,
  onBack,
  loading,
}: PackageStopsStepProps) {
  const [stops, setStops] = useState<StopDraft[]>(data.stops);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formData, setFormData] = useState<Partial<StopDraft>>({
    locationName: "",
    latitude: 14.1111, // Default to Daet area
    longitude: 122.9556,
    description: null,
    estimatedDurationMinutes: null,
  });

  const addStop = () => {
    if (formData.locationName && formData.latitude && formData.longitude) {
      const newStop: StopDraft = {
        locationName: formData.locationName,
        latitude: formData.latitude,
        longitude: formData.longitude,
        description: formData.description || null,
        estimatedDurationMinutes: formData.estimatedDurationMinutes || null,
      };

      if (editingIndex !== null) {
        setStops(stops.map((s, i) => (i === editingIndex ? newStop : s)));
        setEditingIndex(null);
      } else {
        setStops([...stops, newStop]);
      }

      // Reset form
      setFormData({
        locationName: "",
        latitude: 14.1111,
        longitude: 122.9556,
        description: null,
        estimatedDurationMinutes: null,
      });
    }
  };

  const editStop = (index: number) => {
    setFormData(stops[index]);
    setEditingIndex(index);
  };

  const removeStop = (index: number) => {
    setStops(stops.filter((_, i) => i !== index));
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setFormData({
      locationName: "",
      latitude: 14.1111,
      longitude: 122.9556,
      description: null,
      estimatedDurationMinutes: null,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete({ stops });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-daet-ink">Itinerary stops</h2>
        <p className="mt-2 text-sm text-daet-ink/65">
          Add waypoints for your tour. Google Maps integration will show these on a map for tourists.
        </p>
      </div>

      {/* Add/Edit Stop Form */}
      <div className="rounded-2xl border-2 border-dashed border-daet-forest/30 bg-daet-forest/5 p-5">
        <p className="text-sm font-bold text-daet-ink">
          {editingIndex !== null ? "Edit stop" : "Add stop"}
        </p>

        <div className="mt-4 space-y-3">
          <input
            type="text"
            value={formData.locationName || ""}
            onChange={(e) => setFormData({ ...formData, locationName: e.target.value })}
            placeholder="Location name (e.g., Bagasbas Beach)"
            className="w-full rounded-xl border border-daet-ink/15 bg-white px-3 py-2.5 text-sm"
          />

          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              value={formData.latitude || ""}
              onChange={(e) => setFormData({ ...formData, latitude: Number(e.target.value) })}
              placeholder="Latitude"
              step="any"
              className="w-full rounded-xl border border-daet-ink/15 bg-white px-3 py-2.5 text-sm"
            />
            <input
              type="number"
              value={formData.longitude || ""}
              onChange={(e) => setFormData({ ...formData, longitude: Number(e.target.value) })}
              placeholder="Longitude"
              step="any"
              className="w-full rounded-xl border border-daet-ink/15 bg-white px-3 py-2.5 text-sm"
            />
          </div>

          <textarea
            value={formData.description || ""}
            onChange={(e) => setFormData({ ...formData, description: e.target.value || null })}
            placeholder="Brief description of this stop (optional)"
            rows={2}
            className="w-full rounded-xl border border-daet-ink/15 bg-white px-3 py-2.5 text-sm"
          />

          <input
            type="number"
            value={formData.estimatedDurationMinutes || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                estimatedDurationMinutes: e.target.value ? Number(e.target.value) : null,
              })
            }
            placeholder="Estimated duration (minutes, optional)"
            min={0}
            className="w-full rounded-xl border border-daet-ink/15 bg-white px-3 py-2.5 text-sm"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={addStop}
              disabled={!formData.locationName}
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-daet-forest px-5 text-sm font-bold text-white transition hover:bg-daet-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              {editingIndex !== null ? "Update stop" : "Add stop"}
            </button>
            {editingIndex !== null && (
              <button
                type="button"
                onClick={cancelEdit}
                className="inline-flex min-h-10 items-center justify-center rounded-full border border-daet-ink/20 px-5 text-sm font-bold text-daet-ink transition hover:bg-white"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        <p className="mt-3 text-xs text-daet-ink/70">
          <LineIcon name="tip" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" /> Use Google Maps to find latitude/longitude coordinates for accurate pin placement
        </p>
      </div>

      {/* Stops List */}
      {stops.length > 0 && (
        <div>
          <p className="text-sm font-bold text-daet-ink">
            Stops ({stops.length})
          </p>
          <ul className="mt-3 space-y-2">
            {stops.map((stop, index) => (
              <li
                key={index}
                className="flex items-start justify-between gap-3 rounded-2xl bg-white p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-daet-forest text-xs font-black text-white">
                      {index + 1}
                    </span>
                    <p className="font-bold text-daet-ink">{stop.locationName}</p>
                  </div>
                  <p className="mt-1 text-xs text-daet-ink/70">
                    {stop.latitude.toFixed(4)}, {stop.longitude.toFixed(4)}
                  </p>
                  {stop.description && (
                    <p className="mt-1 text-sm text-daet-ink/70">{stop.description}</p>
                  )}
                  {stop.estimatedDurationMinutes && (
                    <p className="mt-1 text-xs text-daet-ink/70">
                      ~{stop.estimatedDurationMinutes} minutes
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => editStop(index)}
                    className="grid h-8 w-8 place-items-center rounded-full text-daet-leaf transition hover:bg-daet-forest/10"
                    aria-label="Edit stop"
                  >
                    <LineIcon name="edit" className="inline-block h-[1.1em] w-[1.1em] align-[-0.15em]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeStop(index)}
                    className="grid h-8 w-8 place-items-center rounded-full text-rose-600 transition hover:bg-rose-50"
                    aria-label="Remove stop"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

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
          disabled={loading || stops.length === 0}
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-daet-forest px-8 text-sm font-black text-white transition hover:bg-daet-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Saving..." : "Continue →"}
        </button>
      </div>
    </form>
  );
}
