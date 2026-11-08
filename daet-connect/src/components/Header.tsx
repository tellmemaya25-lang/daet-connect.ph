export function Header({ active = 'Bookings' }: { active?: string }) {
  return (
    <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-14 gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">D</div>
            <span className="font-bold text-slate-900 tracking-tight">DAET</span>
            <span className="text-slate-500 text-sm hidden sm:inline">CONNECT</span>
          </div>
          <nav className="flex items-center gap-2">
            {['Bookings', 'Packages', 'Revenue'].map((tab) => (
              <button
                key={tab}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                  active === tab
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 text-sm">A</div>
          </div>
        </div>
      </div>
    </header>
  );
}
