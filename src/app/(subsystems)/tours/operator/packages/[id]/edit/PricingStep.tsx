"use client";

import React, { useCallback, useState } from "react";
import type { EditPriceVariant, EditPackageStatus, ValidationErrors, StepProps } from "./edit-types";
import { EDIT_LIMITS } from "./edit-constants";
import { getEditPermissions } from "./permissions";

type PricingStepProps = StepProps<EditPriceVariant[]>;

/**
 * PricingStep Component
 *
 * Manages price variants with:
 * - Table display of existing variants
 * - Add variant form/modal
 * - Edit variant functionality
 * - Delete variant with confirmation
 * - Status-aware restrictions
 */
export function PricingStep({
  data,
  originalData,
  packageStatus,
  onUpdate,
  errors,
  loading,
}: PricingStepProps) {
  const permissions = getEditPermissions(packageStatus);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [formData, setFormData] = useState<Partial<EditPriceVariant>>({
    variantName: "",
    minPax: 1,
    maxPax: null,
    pricePerPax: null,
    flatPrice: null,
    isDefault: false,
  });

  const canAddVariants = permissions.pricing.add;
  const canEditVariants = permissions.pricing.editPax;
  const canRemoveVariants = permissions.pricing.remove;

  // Get pricing errors for the current step
  const getPricingErrors = useCallback(() => {
    const stepErrors: Record<string, string> = {};
    Object.entries(errors).forEach(([key, value]) => {
      if (key.startsWith("priceVariants")) {
        stepErrors[key] = value;
      }
    });
    return stepErrors;
  }, [errors]);

  const handleAddVariant = useCallback(() => {
    if (
      !formData.variantName?.trim() ||
      !formData.minPax ||
      (formData.pricePerPax === null && formData.flatPrice === null)
    ) {
      return;
    }

    const newVariant: EditPriceVariant = {
      id: editingId || `new-${Date.now()}`,
      variantName: formData.variantName,
      minPax: formData.minPax,
      maxPax: formData.maxPax ?? null,
      pricePerPax: formData.pricePerPax ?? null,
      flatPrice: formData.flatPrice ?? null,
      isDefault: editingId ? data.find((v) => v.id === editingId)?.isDefault || false : data.length === 0,
    };

    let updated: EditPriceVariant[];
    if (editingId) {
      updated = data.map((v) => (v.id === editingId ? newVariant : v));
    } else {
      // Only one default allowed
      if (newVariant.isDefault) {
        updated = [...data.map((v) => ({ ...v, isDefault: false })), newVariant];
      } else {
        updated = [...data, newVariant];
      }
    }

    onUpdate(updated);
    setShowAddForm(false);
    setEditingId(undefined);
    setFormData({
      variantName: "",
      minPax: 1,
      maxPax: null,
      pricePerPax: null,
      flatPrice: null,
      isDefault: false,
    });
  }, [formData, editingId, data, onUpdate]);

  const handleEdit = useCallback((variant: EditPriceVariant) => {
    setFormData(variant);
    setEditingId(variant.id);
    setShowAddForm(true);
  }, []);

  const handleDelete = useCallback(
    (id: string | undefined) => {
      if (!id) return;
      onUpdate(data.filter((v) => v.id !== id));
    },
    [data, onUpdate]
  );

  const handleSetDefault = useCallback(
    (id: string | undefined) => {
      if (!id) return;
      onUpdate(
        data.map((v) => ({
          ...v,
          isDefault: v.id === id,
        }))
      );
    },
    [data, onUpdate]
  );

  const pricingErrors = getPricingErrors();

  return (
    <div className="border rounded-lg p-6 bg-white">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Price Variants</h2>
        {canAddVariants && (
          <button
            type="button"
            onClick={() => {
              setShowAddForm(true);
              setFormData({
                variantName: "",
                minPax: 1,
                maxPax: null,
                pricePerPax: null,
                flatPrice: null,
                isDefault: data.length === 0,
              });
            }}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Add Variant
          </button>
        )}
      </div>

      {/* Variants Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-2 text-left font-semibold text-gray-700">Variant Name</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700">Min Pax</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700">Max Pax</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700">Price</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700">Default</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.map((variant) => (
              <tr key={variant.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-900">{variant.variantName}</td>
                <td className="px-4 py-3 text-gray-600">{variant.minPax}</td>
                <td className="px-4 py-3 text-gray-600">{variant.maxPax || "Unlimited"}</td>
                <td className="px-4 py-3 text-gray-600">
                  {variant.pricePerPax ? `₱${variant.pricePerPax}/pax` : `₱${variant.flatPrice}`}
                </td>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={variant.isDefault}
                    onChange={() => handleSetDefault(variant.id)}
                    disabled={!canEditVariants || loading}
                    className="w-4 h-4 rounded border-gray-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </td>
                <td className="px-4 py-3 space-x-2">
                  {canEditVariants && (
                    <button
                      type="button"
                      onClick={() => handleEdit(variant)}
                      disabled={loading}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Edit
                    </button>
                  )}
                  {canRemoveVariants && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("Delete this variant? This action cannot be undone.")) {
                          handleDelete(variant.id);
                        }
                      }}
                      disabled={loading}
                      className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {data.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>No price variants yet. Add one to get started.</p>
          </div>
        )}
      </div>

      {/* Validation Errors */}
      {Object.keys(pricingErrors).length > 0 && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
          <p className="font-medium">Pricing errors:</p>
          <ul className="mt-1 space-y-1">
            {Object.entries(pricingErrors).map(([key, message]) => (
              <li key={key}>• {message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {editingId ? "Edit Variant" : "Add Variant"}
            </h3>

            <div className="space-y-4">
              {/* Variant Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Variant Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.variantName || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, variantName: e.target.value })
                  }
                  maxLength={EDIT_LIMITS.variantName.max}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g., Early Bird"
                />
              </div>

              {/* Min Pax */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Participants <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={EDIT_LIMITS.pax.min}
                  max={EDIT_LIMITS.pax.max}
                  value={formData.minPax || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, minPax: parseInt(e.target.value) || 1 })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              {/* Max Pax */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Participants
                </label>
                <input
                  type="number"
                  min={formData.minPax || 1}
                  max={EDIT_LIMITS.pax.max}
                  value={formData.maxPax || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, maxPax: e.target.value ? parseInt(e.target.value) : null })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Leave blank for unlimited"
                />
              </div>

              {/* Price per Pax */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Price per Person
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={EDIT_LIMITS.price.min}
                  max={EDIT_LIMITS.price.max}
                  value={formData.pricePerPax || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, pricePerPax: e.target.value ? parseFloat(e.target.value) : null })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g., 1500"
                />
              </div>

              {/* Flat Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Flat Price
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={EDIT_LIMITS.price.min}
                  max={EDIT_LIMITS.price.max}
                  value={formData.flatPrice || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, flatPrice: e.target.value ? parseFloat(e.target.value) : null })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g., 5000"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingId(undefined);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddVariant}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  {editingId ? "Update" : "Add"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help text */}
      {!canAddVariants && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
          ℹ️ Price variants cannot be modified for this package status.
        </div>
      )}
    </div>
  );
}
