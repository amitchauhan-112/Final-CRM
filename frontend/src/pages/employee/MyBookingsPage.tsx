import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, Search, IndianRupee, Users, TrendingUp, AlertCircle,
  ChevronLeft, ChevronRight, ExternalLink, Calendar, MapPin,
  CheckCircle, Clock, XCircle,
} from 'lucide-react';
import { useAllBookings } from '../../hooks/useErp';
import { BookingWithLead } from '../../types/index';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatCurrency, formatDate, cn } from '../../utils/helpers';

// ─── Payment status badge ─────────────────────────────────────────────────────

function PaymentBadge({ booking }: { booking: BookingWithLead }) {
  if (booking.balanceAmount === 0) {
    return <span className="badge badge-success flex items-center gap-1"><CheckCircle className="w-3 h-3" />Fully Paid</span>;
  }
  if (booking.amountPaid > 0) {
    const isOverdue = booking.balanceDueDate && new Date(booking.balanceDueDate) < new Date();
    return (
      <span className={cn('badge flex items-center gap-1', isOverdue ? 'badge-danger' : 'bg-amber-100 text-amber-700')}>
        {isOverdue ? <AlertCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
        {isOverdue ? 'Overdue' : 'Partial'}
      </span>
    );
  }
  return <span className="badge badge-danger flex items-center gap-1"><XCircle className="w-3 h-3" />Unpaid</span>;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
// Backend scopes this to the signed-in employee's own bookings automatically
// (getAllBookings forces lead.assignedToId = req.user.id for EMPLOYEE role) —
// no client-side filtering needed, same endpoint the Admin Bookings page uses.

export default function MyBookingsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useAllBookings({ search, status, from, to, page, limit: 20 });

  const bookings = data?.data ?? [];
  const meta = data?.meta;

  const totals = bookings.reduce(
    (acc, b) => ({
      revenue: acc.revenue + b.finalPrice,
      collected: acc.collected + b.amountPaid,
      balance: acc.balance + b.balanceAmount,
      pax: acc.pax + b.numberOfTravelers,
    }),
    { revenue: 0, collected: 0, balance: 0, pax: 0 }
  );

  const handleSearch = (v: string) => { setSearch(v); setPage(1); };
  const handleStatus = (v: string) => { setStatus(v); setPage(1); };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">My Bookings</h2>
          <p className="text-sm text-slate-500 mt-0.5">Bookings from your confirmed leads, with booking & travel dates</p>
        </div>
        {meta && (
          <div className="text-sm text-slate-500">{meta.total} total booking{meta.total !== 1 ? 's' : ''}</div>
        )}
      </div>

      {/* Stats strip */}
      {!isLoading && bookings.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Revenue (page)', value: formatCurrency(totals.revenue), icon: IndianRupee, color: 'text-primary-600' },
            { label: 'Collected', value: formatCurrency(totals.collected), icon: TrendingUp, color: 'text-emerald-600' },
            { label: 'Balance Due', value: formatCurrency(totals.balance), icon: AlertCircle, color: 'text-orange-500' },
            { label: 'Travelers', value: String(totals.pax), icon: Users, color: 'text-slate-700' },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="card flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Icon className={cn('w-4 h-4', s.color)} />
                </div>
                <div className="min-w-0">
                  <p className={cn('text-base font-bold truncate', s.color)}>{s.value}</p>
                  <p className="text-[11px] text-slate-400">{s.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="input pl-9"
            placeholder="Search by name, phone, destination…"
          />
        </div>
        <select value={status} onChange={(e) => handleStatus(e.target.value)} className="input sm:w-36">
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="input sm:w-40" placeholder="From" />
          <span className="text-slate-400 text-sm">–</span>
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="input sm:w-40" placeholder="To" />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : bookings.length === 0 ? (
        <div className="empty-state">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-600">No bookings yet</p>
          <p className="text-sm text-slate-400 mt-1">
            {search || status || from || to ? 'Try adjusting your filters' : 'Leads you confirm will show up here as bookings'}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Customer</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Booking Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden sm:table-cell">Tour</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Price</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden md:table-cell">Paid</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden md:table-cell">Balance</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Payment</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bookings.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 align-top">
                      <p className="font-semibold text-slate-800">{b.travelerName}</p>
                      <p className="text-xs text-slate-400">{b.lead?.phone}</p>
                      {b.lead?.destination && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-slate-300" />
                          <span className="text-xs text-slate-400">{b.lead.destination}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {b.departureDate ? (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span className="text-slate-700 font-medium">{formatDate(b.departureDate)}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Not set yet</span>
                      )}
                      {b.bookingNumber && (
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{b.bookingNumber}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top hidden sm:table-cell">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3 h-3 text-slate-400" />
                          <span className="text-slate-600">{b.numberOfTravelers} traveler{b.numberOfTravelers !== 1 ? 's' : ''}</span>
                        </div>
                        {b.departurePackage && <p className="text-xs text-slate-400">{b.departurePackage}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <p className="font-semibold text-slate-800 tabular">{formatCurrency(b.finalPrice)}</p>
                    </td>
                    <td className="px-4 py-3 align-top text-right hidden md:table-cell">
                      <p className="text-emerald-600 font-medium tabular">{formatCurrency(b.amountPaid)}</p>
                    </td>
                    <td className="px-4 py-3 align-top text-right hidden md:table-cell">
                      <p className={cn('font-medium tabular', b.balanceAmount > 0 ? 'text-orange-500' : 'text-emerald-600')}>
                        {formatCurrency(b.balanceAmount)}
                      </p>
                      {b.balanceDueDate && b.balanceAmount > 0 && (
                        <p className="text-[10px] text-slate-400">Due {formatDate(b.balanceDueDate)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-center">
                      <PaymentBadge booking={b} />
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <button
                        onClick={() => navigate(`/employee/leads?id=${b.leadId}`)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-primary-600 transition-colors"
                        title="View lead"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                Page {meta.page} of {meta.totalPages} · {meta.total} total
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-secondary gap-1 py-1.5 px-3 text-xs disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                  disabled={page === meta.totalPages}
                  className="btn-secondary gap-1 py-1.5 px-3 text-xs disabled:opacity-40"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
