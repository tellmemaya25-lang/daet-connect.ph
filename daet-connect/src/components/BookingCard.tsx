import type { Booking } from '../types';
import { StatusPill } from './StatusPill';

function formatPeso(n: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n);
}

interface Props {
  booking: Booking;
  expanded: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onDecline: () => void;
  onRefund: () => void;
}

export function BookingCard({ booking, expanded, onToggle, onApprove, onDecline, onRefund }: Props) {
  const isToConfirm = booking.status === 'To Confirm';
  const isConfirmed = booking.status === 'Confirmed';
  const isRefunded = booking.status === 'Refunded';

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${expanded ? 'ring-1 ring-slate-200' : ''}`}>
      <div className="px-4 sm:px-5 py-4 flex flex-col lg:flex-row lg:items-center gap-4">
        {/* Left: checkbox + badge + package */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <input type="checkbox" className="mt-2 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
          <div className="w-12 h-12 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700 font-bold text-xs shrink-0">
            DAET
          </div>
          <div className="min-w-0">
            <div className="font-bold text-slate-900 text-sm leading-tight line-clamp-2">{booking.packageName}</div>
            <div className="text-xs font-semibold text-blue-600 mt-0.5">{booking.id}</div>
          </div>
        </div>

        {/* Guest */}
        <div className="flex-1 lg:max-w-[180px] min-w-0">
          <div className="text-[10px] font-semibold tracking-widest text-slate-400">GUEST CONTACT</div>
          <div className="text-sm font-semibold text-slate-900 truncate">{booking.guestName}</div>
          <div className="text-xs text-slate-500">{booking.guestPhone}</div>
        </div>

        {/* Date & Pax */}
        <div className="flex-1 lg:max-w-[160px]">
          <div className="text-[10px] font-semibold tracking-widest text-slate-400">TOUR DATE & PAX</div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>
            {booking.tourDate}
          </div>
          <div className="text-xs text-slate-500">{booking.pax} Guests</div>
        </div>

        {/* Total */}
        <div className="flex-1 lg:max-w-[180px]">
          <div className="text-[10px] font-semibold tracking-widest text-slate-400">TOTAL AMOUNT</div>
          <div className="text-sm font-bold text-slate-900">{formatPeso(booking.totalAmount)}</div>
          <div className="text-xs">
            {isConfirmed ? (
              <span className="text-emerald-600 font-medium">{booking.paymentStatus}</span>
            ) : isRefunded ? (
              <span className="text-emerald-700 font-medium">Refunded via GCash{booking.refundRef ? ` (Ref: ${booking.refundRef})` : ''}</span>
            ) : isToConfirm ? (
              <span className="text-emerald-600 font-medium">Pending Verification</span>
            ) : (
              <span className="text-slate-500">{booking.paymentStatus}</span>
            )}
          </div>
        </div>

        {/* Status + actions */}
        <div className="flex items-center gap-3 lg:max-w-[220px] justify-between lg:justify-end w-full lg:w-auto">
          <StatusPill status={booking.status} />
          <div className="flex items-center gap-2">
            {isToConfirm && (
              <button onClick={onApprove} className="px-3 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm">Approve</button>
            )}
            <button
              onClick={onToggle}
              className={`w-8 h-8 rounded-full flex items-center justify-center border transition ${expanded ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-white'}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={expanded ? "m18 15-6-6-6 6" : "m6 9 6 6 6-6"} /></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Expanded details */}
      <div className={`expand-grid ${expanded ? 'open' : ''}`}>
        <div className="expand-inner">
          <div className="px-4 sm:px-5 pb-4">
            <div className="h-px bg-slate-100 mb-4" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="text-[11px] font-semibold tracking-widest text-blue-800 mb-2">GUEST NOTES & REQUESTS</div>
                <div className="text-sm text-slate-700 italic">"{booking.guestNotes}"</div>
                <div className="mt-3 space-y-1 text-xs text-slate-500">
                  <div>Email: <span className="text-slate-700">{booking.guestEmail}</span></div>
                  <div>Phone: <span className="text-slate-700">{booking.guestPhone}</span></div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="text-[11px] font-semibold tracking-widest text-blue-800 mb-2">GUIDE & OPERATIONS</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500 text-xs">Assigned Guide:</span>
                    <span className={`font-semibold text-xs ${booking.assignedGuide ? 'text-slate-900' : 'text-slate-900'}`}>{booking.assignedGuide ?? 'Unassigned'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 text-xs">Payment Status:</span>
                    <span className={`font-semibold text-xs ${booking.status === 'Refunded' ? 'text-emerald-700' : booking.status === 'Confirmed' ? 'text-emerald-600' : 'text-emerald-600'}`}>
                      {booking.status === 'Confirmed' ? booking.paymentStatus : booking.paymentStatus}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="text-[11px] font-semibold tracking-widest text-blue-800 mb-2">QUICK ACTIONS</div>
                <div className="flex flex-wrap gap-2">
                  {isToConfirm && (
                    <>
                      <button onClick={onApprove} className="px-3 py-2 rounded-full bg-blue-600 text-white text-xs font-semibold">Approve Booking</button>
                      <button onClick={onDecline} className="px-3 py-2 rounded-full bg-red-50 text-red-600 border border-red-200 text-xs font-medium">Decline</button>
                      <button onClick={onRefund} className="px-3 py-2 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-xs font-medium">Process Refund</button>
                    </>
                  )}
                  {isConfirmed && (
                    <>
                      <button onClick={onRefund} className="px-3 py-2 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-xs font-medium">Process Refund</button>
                      <a href={`tel:${booking.guestPhone}`} className="px-3 py-2 rounded-full bg-white border border-slate-200 text-slate-700 text-xs font-medium inline-flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.07 8.81 19.79 19.79 0 0 1 1 0.18 2 2 0 0 1 3 .02h3a2 2 0 0 1 2 1.72c.12 1.35.5 2.66 1.12 3.86a2 2 0 0 1-.57 2.17l-1.42 1.42a16 16 0 0 0 6.09 6.09l1.42-1.42a2 2 0 0 1 2.17-.57c1.2.62 2.51 1 3.86 1.12a2 2 0 0 1 1.72 2Z"/></svg>
                        Call Tourist
                      </a>
                    </>
                  )}
                  {!isToConfirm && !isConfirmed && (
                    <span className="text-xs text-slate-500">No actions available</span>
                  )}
                  {isToConfirm && (
                    <a href={`tel:${booking.guestPhone}`} className="px-3 py-2 rounded-full bg-white border border-slate-200 text-slate-700 text-xs font-medium inline-flex items-center gap-1">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.07 8.81 19.79 19.79 0 0 1 1 0.18 2 2 0 0 1 3 .02h3a2 2 0 0 1 2 1.72c.12 1.35.5 2.66 1.12 3.86a2 2 0 0 1-.57 2.17l-1.42 1.42a16 16 0 0 0 6.09 6.09l1.42-1.42a2 2 0 0 1 2.17-.57c1.2.62 2.51 1 3.86 1.12a2 2 0 0 1 1.72 2Z"/></svg>
                      Call Tourist
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
