import { useEffect, useRef, useState } from 'react';
import { Search, X, BookOpen, Phone, MapPin, Calendar, IndianRupee, Users, Plane, Building2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useAuthStore } from '../../store/authStore';

function useBookingLookup(query: string) {
  return useQuery({
    queryKey: ['booking-lookup', query],
    queryFn: async () => (await api.get(`/erp/booking-lookup?q=${encodeURIComponent(query)}`)).data,
    enabled: query.trim().length >= 3,
    staleTime: 30 * 1000,
  });
}

function fmt(n?: number | null) {
  if (n == null) return '—';
  return `₹${n.toLocaleString('en-IN')}`;
}
function fmtDate(d?: string | Date | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }: { status?: string | null }) {
  const map: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-800',
    COMPLETED: 'bg-blue-100 text-blue-800',
    CANCELLED: 'bg-red-100 text-red-800',
    VERIFIED: 'bg-emerald-100 text-emerald-700',
    PENDING: 'bg-amber-100 text-amber-800',
    REJECTED: 'bg-red-100 text-red-700',
  };
  const s = status ?? 'ACTIVE';
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${map[s] ?? 'bg-slate-100 text-slate-600'}`}>
      {s}
    </span>
  );
}

function BookingCard({ booking, role }: { booking: any; role: string }) {
  const showFinance = role === 'ADMIN' || role === 'FINANCE';
  const showOps = role === 'ADMIN' || role === 'OPERATIONS';
  const showSales = role === 'ADMIN' || role === 'EMPLOYEE';

  return (
    <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary-600 flex-shrink-0" />
            <span className="font-mono text-sm font-bold text-primary-700">{booking.bookingNumber ?? booking.id.slice(0, 8)}</span>
            <StatusBadge status={booking.status} />
          </div>
          <p className="text-base font-semibold text-slate-900 mt-1">{booking.travelerName}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-slate-400">Travelers</p>
          <p className="text-sm font-bold text-slate-700 flex items-center gap-1"><Users className="w-3.5 h-3.5" />{booking.numberOfTravelers}</p>
        </div>
      </div>

      {/* Lead / Customer info */}
      {booking.lead && (
        <div className="bg-slate-50 rounded-lg px-3 py-2 space-y-1">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Customer</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
            <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-slate-400" />{booking.lead.phone}</span>
            {booking.lead.destination && (
              <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-slate-400" />{booking.lead.destination}</span>
            )}
            {showSales && booking.lead.assignedTo && (
              <span className="text-xs text-slate-500">Assigned: <span className="font-medium">{booking.lead.assignedTo.name}</span></span>
            )}
          </div>
          {booking.lead.email && <p className="text-xs text-slate-500">{booking.lead.email}</p>}
        </div>
      )}

      {/* Trip dates & package */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
        {booking.departureDate && (
          <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-slate-400" />Dep: {fmtDate(booking.departureDate)}</span>
        )}
        {booking.returnDate && (
          <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-slate-400" />Ret: {fmtDate(booking.returnDate)}</span>
        )}
        {booking.package && (
          <span className="flex items-center gap-1"><Plane className="w-3.5 h-3.5 text-slate-400" />{booking.package.name}</span>
        )}
        {booking.tourType && (
          <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{booking.tourType}</span>
        )}
      </div>

      {/* Finance section */}
      {showFinance && (
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Financial Details</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-50 rounded-lg p-2">
              <p className="text-[10px] text-slate-400">Total</p>
              <p className="text-sm font-bold text-slate-800">{fmt(booking.finalPrice)}</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-2">
              <p className="text-[10px] text-slate-400">Paid</p>
              <p className="text-sm font-bold text-emerald-700">{fmt(booking.amountPaid)}</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-2">
              <p className="text-[10px] text-slate-400">Balance</p>
              <p className="text-sm font-bold text-amber-700">{fmt(booking.balanceAmount)}</p>
            </div>
          </div>
          {booking.balanceDueDate && (
            <p className="text-xs text-slate-500">Balance due: <span className="font-medium">{fmtDate(booking.balanceDueDate)}</span></p>
          )}
          {booking.payments && booking.payments.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Payments</p>
              {booking.payments.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 rounded px-2 py-1">
                  <span className="flex items-center gap-1"><IndianRupee className="w-3 h-3" />{p.amount?.toLocaleString('en-IN')} · {p.method}</span>
                  <span className="flex items-center gap-1.5">
                    <StatusBadge status={p.status} />
                    <span className="text-slate-400">{fmtDate(p.createdAt)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ops section */}
      {showOps && booking.departure && (
        <div className="border-t border-slate-100 pt-3 space-y-1">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Departure / Operations</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-slate-400" />{fmtDate(booking.departure.departureDate)}</span>
            {booking.departure.destination && (
              <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5 text-slate-400" />{booking.departure.destination}</span>
            )}
            <StatusBadge status={booking.departure.status} />
          </div>
        </div>
      )}

      {/* Special request */}
      {booking.specialRequest && (
        <p className="text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded px-2 py-1">
          <span className="font-semibold">Note:</span> {booking.specialRequest}
        </p>
      )}
    </div>
  );
}

export default function BookingLookup() {
  const { user } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isFetching } = useBookingLookup(query);
  const results: any[] = data?.data ?? [];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const role = user?.role ?? 'EMPLOYEE';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors text-xs font-medium"
        title="Search by Booking ID or Mobile"
      >
        <Search className="w-4 h-4" />
        <span className="hidden sm:inline">Booking Search</span>
      </button>

      {open && (
        <div className="fixed inset-x-2 top-14 sm:absolute sm:inset-x-auto sm:top-10 sm:right-0 sm:w-[420px] z-50">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            {/* Search input */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
              <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Booking ID (BKG-…) or mobile number"
                className="flex-1 text-sm outline-none placeholder:text-slate-400"
              />
              {query && (
                <button onClick={() => setQuery('')} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 ml-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-[70vh] overflow-y-auto p-3 space-y-3">
              {query.trim().length < 3 ? (
                <div className="text-center py-8">
                  <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">Enter at least 3 characters</p>
                  <p className="text-xs text-slate-400 mt-1">Search by Booking ID or registered mobile number</p>
                </div>
              ) : isFetching ? (
                <p className="text-center text-sm text-slate-400 py-8">Searching…</p>
              ) : results.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-slate-400">No bookings found for "{query}"</p>
                  <p className="text-xs text-slate-400 mt-1">Try the full booking ID or complete mobile number</p>
                </div>
              ) : (
                results.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} role={role} />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
