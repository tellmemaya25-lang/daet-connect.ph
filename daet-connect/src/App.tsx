import { useMemo, useState } from 'react';
import { Header } from './components/Header';
import { FilterBar } from './components/FilterBar';
import { BookingCard } from './components/BookingCard';
import { ApproveModal } from './components/ApproveModal';
import { Toast } from './components/Toast';
import { bookingsData } from './data/bookings';
import { guides } from './data/guides';
import type { Booking, BookingStatus } from './types';

function App() {
  const [bookings, setBookings] = useState<Booking[]>(bookingsData);
  const [search, setSearch] = useState('');
  const [packageFilter, setPackageFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'All'>('All');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [modalBooking, setModalBooking] = useState<Booking | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const packageOptions = useMemo(() => Array.from(new Set(bookingsData.map(b => b.packageName))), []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: bookings.length };
    (['To Confirm', 'Confirmed', 'Completed', 'Declined', 'Refunded'] as BookingStatus[]).forEach(s => {
      c[s] = bookings.filter(b => b.status === s).length;
    });
    return c;
  }, [bookings]);

  const filtered = useMemo(() => {
    return bookings.filter(b => {
      if (statusFilter !== 'All' && b.status !== statusFilter) return false;
      if (packageFilter !== 'All' && b.packageName !== packageFilter) return false;
      if (dateFilter && b.tourDate !== dateFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${b.id} ${b.packageName} ${b.guestName} ${b.guestPhone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [bookings, search, packageFilter, dateFilter, statusFilter]);

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const handleApprove = (booking: Booking) => {
    setModalBooking(booking);
  };

  const handleConfirm = (guideId: string) => {
    if (!modalBooking) return;
    const guide = guides.find(g => g.id === guideId);
    if (!guide) return;
    setBookings(prev => prev.map(b => b.id === modalBooking.id ? {
      ...b,
      status: 'Confirmed' as BookingStatus,
      assignedGuide: guide.name,
      assignedGuideId: guide.id,
      paymentStatus: `₱${b.totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} of ₱${b.totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} paid`,
      paidAmount: b.totalAmount,
    } : b));
    showToast(`Booking ${modalBooking.id} confirmed with guide ${guide.name}!`);
    setModalBooking(null);
  };

  const handleDecline = (id: string) => {
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'Declined' as BookingStatus, paymentStatus: 'Declined - Operator Rejected' } : b));
    showToast(`Booking ${id} declined.`);
  };

  const handleRefund = (id: string) => {
    const ref = Math.floor(1000000000 + Math.random() * 9000000000).toString();
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'Refunded' as BookingStatus, paymentStatus: 'Refunded via GCash', refundRef: ref } : b));
    showToast(`Booking ${id} refunded via GCash (Ref: ${ref})`);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Bookings</h1>
          <p className="text-sm text-slate-500 mt-1">Easy booking for Camarines Tour Services, managed flow.</p>
        </div>

        <FilterBar
          search={search}
          setSearch={setSearch}
          packageFilter={packageFilter}
          setPackageFilter={setPackageFilter}
          dateFilter={dateFilter}
          setDateFilter={setDateFilter}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          counts={counts}
          packageOptions={packageOptions}
        />

        <div className="mt-4 bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 hidden lg:flex items-center text-[11px] font-semibold tracking-widest text-slate-500">
          <div className="w-4 flex items-center"><input type="checkbox" className="w-4 h-4 rounded border-slate-300" /></div>
          <div className="flex-1 ml-6">Tour Package & Ref</div>
          <div className="w-[180px]">Guest</div>
          <div className="w-[160px]">Date & Pax</div>
          <div className="w-[180px]">Total</div>
          <div className="w-[220px] text-right">Status</div>
        </div>

        <div className="mt-3 space-y-3">
          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <div className="text-slate-400 text-sm">No bookings found matching your filters.</div>
              <button onClick={() => { setSearch(''); setPackageFilter('All'); setDateFilter(''); setStatusFilter('All'); }} className="mt-3 px-4 py-2 rounded-full bg-blue-600 text-white text-sm font-medium">Clear filters</button>
            </div>
          ) : (
            filtered.map(b => (
              <BookingCard
                key={b.id}
                booking={b}
                expanded={expanded.has(b.id)}
                onToggle={() => toggleExpanded(b.id)}
                onApprove={() => handleApprove(b)}
                onDecline={() => handleDecline(b.id)}
                onRefund={() => handleRefund(b.id)}
              />
            ))
          )}
        </div>

        <div className="mt-6 text-center text-xs text-slate-400">
          Showing {filtered.length} of {bookings.length} bookings • Data is mocked for demo • <span className="text-blue-600">DAET-CONNECT v1.0</span>
        </div>
      </main>

      <ApproveModal
        booking={modalBooking}
        open={!!modalBooking}
        onClose={() => setModalBooking(null)}
        onConfirm={handleConfirm}
      />

      <Toast show={!!toast} message={toast ?? ''} />
    </div>
  );
}

export default App;
