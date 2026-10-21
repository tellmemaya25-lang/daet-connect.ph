"use client";

import React from "react";
import { EDIT_LIMITS } from "./edit-constants";

interface RejectionNoticeProps {
  reason: string | null;
  maxLength?: number;
}

/**
 * RejectionNotice Component
 *
 * Displays the rejection reason for a rejected package.
 * Only renders if reason exists and is non-empty.
 */
export function RejectionNotice({ reason, maxLength = EDIT_LIMITS.rejectionReason }: RejectionNoticeProps) {
  if (!reason || reason.trim() === "") {
    return null;
  }

  const displayReason = reason.length > maxLength ? `${reason.substring(0, maxLength)}...` : reason;

  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
      <div className="flex gap-3">
        <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
        <div className="flex-1">
          <h3 className="font-semibold text-red-900 mb-1">Rejection Reason</h3>
          <p className="text-red-800 text-sm whitespace-pre-wrap break-words">{displayReason}</p>
          <p className="text-red-700 text-xs mt-2 italic">Please review and address the feedback before resubmitting.</p>
        </div>
      </div>
    </div>
  );
}
