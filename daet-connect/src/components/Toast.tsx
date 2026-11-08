interface Props {
  message: string;
  show: boolean;
}

export function Toast({ message, show }: Props) {
  if (!show) return null;
  return (
    <div className="fixed top-4 right-4 z-50 animate-in">
      <div className="bg-white border border-blue-200 rounded-xl shadow-lg px-4 py-3 flex items-center gap-3 min-w-[340px]">
        <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></svg>
        </div>
        <div>
          <div className="text-[11px] font-bold tracking-widest text-blue-600">DAET-CONNECT COMMAND</div>
          <div className="text-sm font-medium text-slate-900">{message}</div>
        </div>
      </div>
    </div>
  );
}
