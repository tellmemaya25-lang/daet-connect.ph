import type { BookingStatus } from '../types';

interface Props {
  status: BookingStatus;
  size?: 'sm' | 'md';
}

export function StatusPill({ status, size = 'md' }: Props) {
  const base = "inline-flex items-center gap-1.5 font-medium rounded-full border px-3 py-1 text-xs whitespace-nowrap";
  const sizeCls = size === 'sm' ? 'text-[11px] px-2.5 py-1' : 'text-xs';

  if (status === 'To Confirm') {
    return (
      <span className={`${base} ${sizeCls} bg-amber-50 text-amber-700 border-amber-200`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        To Confirm
      </span>
    );
  }
  if (status === 'Confirmed') {
    return (
      <span className={`${base} ${sizeCls} bg-emerald-50 text-emerald-700 border-emerald-200`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></svg>
        Confirmed
      </span>
    );
  }
  if (status === 'Refunded') {
    return (
      <span className={`${base} ${sizeCls} bg-purple-50 text-purple-700 border-purple-200`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6"/><path d="M21 17v-6h-6"/><path d="M3 12a9 9 0 1 0 3-6.7L3 7"/><path d="M21 12a9 9 0 1 1-3 6.7L21 17"/></svg>
        Refunded
      </span>
    );
  }
  if (status === 'Completed') {
    return (
      <span className={`${base} ${sizeCls} bg-slate-100 text-slate-700 border-slate-200`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg>
        Completed
      </span>
    );
  }
  if (status === 'Declined') {
    return (
      <span className={`${base} ${sizeCls} bg-red-50 text-red-700 border-red-200`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
        Declined
      </span>
    );
  }
  return <span className={`${base} ${sizeCls}`}>{status}</span>;
}
