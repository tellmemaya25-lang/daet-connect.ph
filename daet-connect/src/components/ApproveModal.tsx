import type { Booking } from '../types';
import { guides } from '../data/guides';
import { useState } from 'react';

interface Props {
  booking: Booking | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (guideId: string) => void;
}

export function ApproveModal({ booking, open, onClose, onConfirm }: Props) {
  const [selected, setSelected] = useState('');
  if (!open || !booking) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-[20px] shadow-2xl w-full max-w-[520px] overflow-hidden">
        <div className="px-6 pt-5 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold tracking-widest text-blue-600">{booking.id}</div>
              <h3 className="text-lg font-bold text-slate-900 mt-1">Approve & Assign Eco-Guide</h3>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
          <div className="h-px bg-slate-100 my-4" />

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">Package:</div>
            <div className="font-bold text-slate-900 text-sm mt-0.5">{booking.packageName}</div>
            <div className="flex items-center justify-between mt-2">
              <div className="text-xs text-slate-500">Guest: <span className="font-semibold text-slate-900">{booking.guestName}</span></div>
              <div className="text-xs text-slate-500">Pax: <span className="font-semibold text-slate-900">{booking.pax}</span></div>
            </div>
          </div>

          <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-3 flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0 mt-0.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5"/></svg>
            </div>
            <p className="text-xs leading-5 text-emerald-800">Daily capacity check verified: Sufficient slots available for {booking.tourDate}.</p>
          </div>

          <div className="mt-4">
            <label className="text-[11px] font-semibold tracking-widest text-slate-600">ASSIGN CERTIFIED LOCAL ECO-GUIDE</label>
            <div className="mt-2">
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="w-full px-3 py-3 rounded-xl border border-blue-500 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select accredited guide...</option>
                {guides.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.specialty})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="h-px bg-slate-100 my-4" />
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium">Cancel</button>
            <button
              disabled={!selected}
              onClick={() => {
                if (selected) {
                  onConfirm(selected);
                  setSelected('');
                }
              }}
              className={`px-5 py-2.5 rounded-full text-sm font-semibold shadow-sm transition ${selected ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
            >
              Confirm & Send Voucher
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
