'use client';

import { useState } from 'react';
import { updatePackageStatus } from './actions';

interface PackageReviewFormProps {
  packageId: string;
  currentStatus: string;
}

export function PackageReviewForm({ packageId, currentStatus }: PackageReviewFormProps) {
  // Map invalid status to valid enum values
  const getValidStatus = (status: string) => {
    const validStatuses = ['draft', 'pending_review', 'published', 'archived'];
    if (validStatuses.includes(status)) return status;
    // Map old "pending" to new "pending_review"
    if (status === 'pending') return 'pending_review';
    // Default to pending_review for any other invalid status
    return 'pending_review';
  };

  const [status, setStatus] = useState(getValidStatus(currentStatus));
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    const formData = new FormData();
    formData.append('packageId', packageId);
    formData.append('status', status);
    formData.append('notes', notes);


    const result = await updatePackageStatus(formData);

    if (result.success) {
      setMessage({ type: 'success', text: 'Package status updated successfully!' });
      setNotes('');
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to update package status' });
      console.error('Update error:', result.error); // Debug log
    }

    setIsSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-2xl border border-daet-ink/20 p-6">
      <h2 className="text-xl font-bold text-daet-ink mb-4">Review & Update Status</h2>

      {message && (
        <div className={`mb-4 p-4 rounded-2xl ${
          message.type === 'success' ? 'bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-300' : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-daet-ink/80 mb-2">
            Status
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full px-3 py-2 border border-daet-ink/20 rounded-2xl focus:outline-none focus:ring-2 focus:ring-daet-forest/30"
            disabled={isSubmitting}
          >
            <option value="draft">Draft</option>
            <option value="pending_review">Pending Review</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
          <p className="mt-1 text-sm text-daet-ink/70">
            {status === 'draft' && 'Package is incomplete or being edited'}
            {status === 'pending_review' && 'Package is awaiting admin review'}
            {status === 'published' && 'Package will be visible to tourists'}
            {status === 'archived' && 'Package will be hidden from public view'}
          </p>
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-daet-ink/80 mb-2">
            Admin Notes (Optional)
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-daet-ink/20 rounded-2xl focus:outline-none focus:ring-2 focus:ring-daet-forest/30"
            placeholder="Add notes about this review decision..."
            disabled={isSubmitting}
          />
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={isSubmitting || status === getValidStatus(currentStatus)}
            className="min-h-11 flex-1 bg-daet-forest text-white px-4 py-2 rounded-2xl hover:bg-daet-leaf disabled:bg-line disabled:cursor-not-allowed font-medium"
          >
            {isSubmitting ? 'Updating...' : 'Update Status'}
          </button>

          {status !== 'published' && (
            <button
              type="button"
              onClick={() => {
                setStatus('published');
                setTimeout(() => {
                  const form = document.querySelector('form');
                  if (form) {
                    const event = new Event('submit', { bubbles: true, cancelable: true });
                    form.dispatchEvent(event);
                  }
                }, 100);
              }}
              disabled={isSubmitting}
              className="px-6 py-2 bg-green-600 text-white rounded-2xl hover:bg-green-700 disabled:bg-line disabled:cursor-not-allowed font-medium"
            >
              Quick Approve
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
