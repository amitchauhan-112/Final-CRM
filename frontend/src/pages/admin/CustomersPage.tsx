import { useState } from 'react';
import {
  UserCheck, Search, Users, MapPin, Phone,
  Mail, Calendar, ChevronLeft, ChevronRight,
  CheckCircle, Clock, AlertCircle,
} from 'lucide-react';
import { useCustomers } from '../../hooks/useErp';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatCurrency, cn } from '../../utils/helpers';
import LeadDetail from '../../components/leads/LeadDetail';

// ─── Customer Card ────────────────────────────────────────────────────────────

function CustomerCard({ lead, onView }: { lead: any; onView: (id: string) => void }) {
  const booking = lead.booking;

  const paymentStatus = !booking
    ? null
    : booking.balanceAmount === 0
    ? 'paid'
    : booking.amountPaid > 0 && booking.balanceDueDate && new Date(booking.balanceDueDate) < new Date()
    ? 'overdue'
    : booking.amountPaid > 0
    ? 'partial'
    : 'unpaid';

  const statusConfig = {
    paid: { label: 'Fully Paid', cls: 'badge-success', icon: CheckCircle },
    partial: { label: 'Partial', cls: 'bg-amber-100 text-amber-700', icon: Clock },
    overdue: { label: 'Overdue', cls: 'badge-danger', icon: AlertCircle },
    unpaid: { label: 'Unpaid', cls: 'bg-red-100 text-red-600', icon: AlertCircle },
  };

  const ps = paymentStatus ? statusConfig[paymentStatus] : null;
  const PsIcon = ps?.icon;

  return (
    <div
      className="card-interactive p-5"
      onClick={() => onView(lead.id)}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-mountain-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {lead.name[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 text-sm truncate">{lead.name}</p>
              {ps && PsIcon && (
                <span className={cn('badge text-[10px] flex items-center gap-1 w-fit', ps.cls)}>
                  <PsIcon className="w-2.5 h-2.5" />{ps.label}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="space-y-1 mb-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Phone className="w-3 h-3 text-slate-400 flex-shrink-0" />
          <span>{lead.phone}</span>
        </div>
        {lead.email && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Mail className="w-3 h-3 text-slate-400 flex-shrink-0" />
            <span className="truncate">{lead.email}</span>
          </div>
        )}
        {lead.destination && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
            <span className="truncate">{lead.destination}</span>
          </div>
        )}
        {lead.preferredDate && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Calendar className="w-3 h-3 text-slate-400 flex-shrink-0" />
            <span>{lead.preferredDate}</span>
          </div>
        )}
      </div>

      {/* Booking info */}
      {booking ? (
        <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Users className="w-3 h-3" />{booking.numberOfTravelers} Traveler{booking.numberOfTravelers !== 1 ? 's' : ''}
            </span>
            {booking.tourType && (
              <span className="text-[10px] font-bold text-slate-400">{booking.tourType}</span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Final Price</span>
            <span className="text-sm font-bold text-slate-800">{formatCurrency(booking.finalPrice)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Paid</span>
            <span className="text-xs font-semibold text-emerald-600">{formatCurrency(booking.amountPaid)}</span>
          </div>
          {booking.balanceAmount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Balance</span>
              <span className={cn('text-xs font-semibold', paymentStatus === 'overdue' ? 'text-red-500' : 'text-orange-500')}>
                {formatCurrency(booking.balanceAmount)}
              </span>
            </div>
          )}
          {booking.departureLocation && (
            <p className="text-[10px] text-slate-400">From: {booking.departureLocation}</p>
          )}
        </div>
      ) : (
        <div className="bg-slate-50 rounded-xl p-3 text-center text-xs text-slate-400">No booking details</div>
      )}

      {/* Assigned to */}
      {lead.assignedTo && (
        <p className="text-[10px] text-slate-400 mt-2">Handled by {lead.assignedTo.name}</p>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const { data, isLoading } = useCustomers({ search, page, limit: 24 });

  const customers = data?.data ?? [];
  const meta = data?.meta;

  const stats = {
    total: meta?.total ?? 0,
    withBooking: customers.filter((c: any) => !!c.booking).length,
    fullyPaid: customers.filter((c: any) => c.booking?.balanceAmount === 0).length,
    withBalance: customers.filter((c: any) => c.booking?.balanceAmount > 0).length,
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="page-title">Customers</h2>
          <p className="text-sm text-slate-500 mt-0.5">Confirmed leads with booking details</p>
        </div>
        {meta && <p className="text-sm text-slate-500">{meta.total} customer{meta.total !== 1 ? 's' : ''}</p>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Customers', value: meta?.total ?? 0, color: 'text-slate-800' },
          { label: 'With Booking', value: stats.withBooking, color: 'text-primary-600' },
          { label: 'Fully Paid', value: stats.fullyPaid, color: 'text-emerald-600' },
          { label: 'Balance Pending', value: stats.withBalance, color: 'text-orange-500' },
        ].map((s) => (
          <div key={s.label} className="card text-center px-4 py-3">
            <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="input pl-9"
          placeholder="Search by name, phone, email…"
        />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
        </div>
      ) : customers.length === 0 ? (
        <div className="empty-state">
          <UserCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-600">No customers yet</p>
          <p className="text-sm text-slate-400 mt-1">
            {search ? 'No customers match your search' : 'Leads marked as Confirmed will appear here'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {customers.map((c: any) => (
              <CustomerCard
                key={c.id}
                lead={c}
                onView={setSelectedLeadId}
              />
            ))}
          </div>

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">Page {meta.page} of {meta.totalPages}</p>
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

      <LeadDetail
        leadId={selectedLeadId}
        open={!!selectedLeadId}
        onClose={() => setSelectedLeadId(null)}
      />
    </div>
  );
}
