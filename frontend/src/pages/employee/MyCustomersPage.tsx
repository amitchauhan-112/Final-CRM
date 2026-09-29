import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserCheck, Search, Phone, Mail, MapPin, Calendar,
  Users, IndianRupee, CheckCircle, Clock, AlertCircle, ExternalLink,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useCustomers } from '../../hooks/useErp';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatCurrency, formatDate, cn } from '../../utils/helpers';

function PaymentStatus({ booking }: { booking: any }) {
  if (!booking) return <span className="badge badge-muted">No Booking</span>;
  if (booking.balanceAmount === 0) return (
    <span className="badge badge-success flex items-center gap-1 w-fit">
      <CheckCircle className="w-2.5 h-2.5" />Fully Paid
    </span>
  );
  const isOverdue = booking.balanceDueDate && new Date(booking.balanceDueDate) < new Date();
  return (
    <span className={cn('badge flex items-center gap-1 w-fit', isOverdue ? 'badge-danger' : 'bg-amber-100 text-amber-700')}>
      {isOverdue ? <AlertCircle className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
      {isOverdue ? 'Overdue' : 'Balance Pending'}
    </span>
  );
}

export default function MyCustomersPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useCustomers({ search, page, limit: 20 });

  // Filter to only show current employee's assigned customers
  const allCustomers = data?.data ?? [];
  const customers = allCustomers.filter((c: any) => c.assignedToId === user?.id);
  const meta = data?.meta;

  const stats = {
    total: customers.length,
    fullyPaid: customers.filter((c: any) => c.booking?.balanceAmount === 0).length,
    balanceDue: customers.filter((c: any) => c.booking?.balanceAmount > 0).length,
    totalRevenue: customers.reduce((s: number, c: any) => s + (c.booking?.finalPrice ?? 0), 0),
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="page-title">My Customers</h2>
        <p className="text-sm text-slate-500 mt-0.5">Confirmed leads assigned to you</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'My Customers', value: String(stats.total), color: 'text-slate-800' },
          { label: 'Fully Paid', value: String(stats.fullyPaid), color: 'text-emerald-600' },
          { label: 'Balance Due', value: String(stats.balanceDue), color: 'text-orange-500' },
          { label: 'Total Revenue', value: formatCurrency(stats.totalRevenue), color: 'text-primary-600' },
        ].map((s) => (
          <div key={s.label} className="card text-center px-4 py-3">
            <p className={cn('text-xl font-bold', s.color)}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="input pl-9" placeholder="Search by name, phone…" />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : customers.length === 0 ? (
        <div className="empty-state">
          <UserCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-600">No customers yet</p>
          <p className="text-sm text-slate-400 mt-1">
            {search ? 'No matches found' : 'Leads assigned to you that are marked Confirmed will appear here'}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {customers.map((c: any) => {
              const booking = c.booking;
              const isOverdue = booking?.balanceDueDate && booking?.balanceAmount > 0 && new Date(booking.balanceDueDate) < new Date();

              return (
                <div key={c.id} className="card p-4 hover:shadow-md transition-all">
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-mountain-400 to-primary-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {c.name[0].toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-800">{c.name}</p>
                          <PaymentStatus booking={booking} />
                        </div>
                        <button
                          onClick={() => navigate(`/employee/leads?id=${c.id}`)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-primary-600 transition-colors flex-shrink-0"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-500">
                        <div className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400" />{c.phone}
                        </div>
                        {c.email && (
                          <div className="flex items-center gap-1">
                            <Mail className="w-3 h-3 text-slate-400" /><span className="truncate">{c.email}</span>
                          </div>
                        )}
                        {c.destination && (
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400" />{c.destination}
                          </div>
                        )}
                        {c.preferredDate && (
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />{c.preferredDate}
                          </div>
                        )}
                      </div>

                      {booking && (
                        <div className="mt-3 flex flex-wrap gap-4 text-xs">
                          <div className="flex items-center gap-1 text-slate-600">
                            <Users className="w-3 h-3 text-slate-400" />
                            {booking.numberOfTravelers} traveler{booking.numberOfTravelers !== 1 ? 's' : ''}
                          </div>
                          <div className="flex items-center gap-1 font-semibold text-slate-700">
                            <IndianRupee className="w-3 h-3" />Total: {formatCurrency(booking.finalPrice)}
                          </div>
                          <div className="text-emerald-600">
                            Paid: {formatCurrency(booking.amountPaid)}
                          </div>
                          {booking.balanceAmount > 0 && (
                            <div className={cn(isOverdue ? 'text-red-500' : 'text-orange-500', 'font-medium')}>
                              Bal: {formatCurrency(booking.balanceAmount)}
                              {booking.balanceDueDate && (
                                <span className="ml-1 font-normal text-slate-400">
                                  {isOverdue ? '(overdue)' : `(due ${formatDate(booking.balanceDueDate)})`}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">Page {page} of {meta.totalPages}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary py-1.5 px-3 text-xs gap-1 disabled:opacity-40">
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </button>
                <button onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))} disabled={page === meta.totalPages} className="btn-secondary py-1.5 px-3 text-xs gap-1 disabled:opacity-40">
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
