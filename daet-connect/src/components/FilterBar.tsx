import type { BookingStatus } from '../types';

interface Props {
  search: string;
  setSearch: (v: string) => void;
  packageFilter: string;
  setPackageFilter: (v: string) => void;
  dateFilter: string;
  setDateFilter: (v: string) => void;
  statusFilter: BookingStatus | 'All';
  setStatusFilter: (v: BookingStatus | 'All') => void;
  counts: Record<string, number>;
  packageOptions: string[];
}

export function FilterBar({
  search,
  setSearch,
  packageFilter,
  setPackageFilter,
  dateFilter,
  setDateFilter,
  statusFilter,
  setStatusFilter,
  counts,
  packageOptions,
}: Props) {
  const pills: Array<{ label: BookingStatus | 'All'; count: number }> = [
    { label: 'All', count: counts['All'] ?? 0 },
    { label: 'To Confirm', count: counts['To Confirm'] ?? 0 },
    { label: 'Confirmed', count: counts['Confirmed'] ?? 0 },
    { label: 'Completed', count: counts['Completed'] ?? 0 },
    { label: 'Declined', count: counts['Declined'] ?? 0 },
    { label: 'Refunded', count: counts['Refunded'] ?? 0 },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Reference, package, name or phone..."
            className="w-full pl-9 pr-3 py-2.5 rounded-full border border-slate-200 bg-slate-50 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex-1 lg:max-w-[280px]">
          <select
            value={packageFilter}
            onChange={(e) => setPackageFilter(e.target.value)}
            className="w-full px-3 py-2.5 rounded-full border border-slate-200 bg-slate-50 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="All">All Tour Packages</option>
            {packageOptions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 lg:max-w-[280px] relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 rounded-full border border-slate-200 bg-slate-50 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="h-px bg-slate-100 my-3" />

      <div className="flex flex-wrap gap-2">
        {pills.map((pill) => {
          const active = statusFilter === pill.label;
          return (
            <button
              key={pill.label}
              onClick={() => setStatusFilter(pill.label)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition ${
                active
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-white'
              }`}
            >
              {pill.label}
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${active ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {pill.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
