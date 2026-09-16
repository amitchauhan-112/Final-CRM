import { useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Map, Users, IndianRupee, AlertCircle, ChevronRight, Trash2 } from 'lucide-react';
import { useDepartures, useDeleteDeparture } from '../../hooks/useOperations';
import Table, { Column } from '../../components/ui/Table';
import Pagination from '../../components/ui/Pagination';
import DeleteDepartureReasonModal from '../../components/operations/DeleteDepartureReasonModal';
import { DepartureListItem } from '../../types/index';
import { formatCurrency, cn } from '../../utils/helpers';
import { useAuthStore } from '../../store/authStore';

const STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'UPCOMING', label: 'Upcoming' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const STATUS_BADGE: Record<string, string> = {
  UPCOMING: 'bg-primary-50 text-primary-700',
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  COMPLETED: 'bg-slate-100 text-slate-600',
  CANCELLED: 'bg-red-50 text-red-600',
};

function formatDatePretty(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function DeparturesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const base = location.pathname.startsWith('/admin') ? '/admin/operations' : '/operations';
  const [searchParams] = useSearchParams();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [deleteTarget, setDeleteTarget] = useState<DepartureListItem | null>(null);

  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.role === 'ADMIN';
  const deleteDeparture = useDeleteDeparture();

  const handleSearch = (v: string) => { setSearch(v); setPage(1); };
  const handleStatus = (v: string) => { setStatus(v); setPage(1); };

  const { data, isLoading } = useDepartures({ search: search || undefined, status: status || undefined, page, limit: 20 });
  const departures = data?.data ?? [];
  const meta = data?.meta;

  const handleDeleteConfirm = (reason: string) => {
    if (!deleteTarget) return;
    deleteDeparture.mutate({ id: deleteTarget.id, reason }, { onSuccess: () => setDeleteTarget(null) });
  };

  const columns: Column<DepartureListItem>[] = [
    {
      key: 'date',
      header: 'Departure',
      render: (d) => (
        <div>
          <p className="font-semibold text-slate-800">{formatDatePretty(d.departureDate)}</p>
          {d.package && <p className="text-xs text-slate-400">{d.package.name}</p>}
        </div>
      ),
    },
    {
      key: 'destination',
      header: 'Destination',
      render: (d) => (
        <div className="flex items-center gap-1.5">
          <Map className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-medium text-slate-700">{d.destination}</span>
        </div>
      ),
    },
    {
      key: 'travelers',
      header: 'Travelers',
      render: (d) => (
        <div className="flex items-center gap-1.5 text-slate-600">
          <Users className="w-3.5 h-3.5 text-slate-400" />
          {d.totalTravelers} · {d.bookingCount} booking{d.bookingCount !== 1 ? 's' : ''}
        </div>
      ),
    },
    {
      key: 'revenue',
      header: 'Revenue',
      render: (d) => (
        <div>
          <p className="flex items-center gap-1 text-slate-700 font-medium"><IndianRupee className="w-3 h-3" />{formatCurrency(d.totalRevenue)}</p>
          {d.totalPending > 0 && <p className="text-xs text-orange-500">{formatCurrency(d.totalPending)} pending</p>}
        </div>
      ),
    },
    {
      key: 'pending',
      header: 'Pending Items',
      render: (d) => {
        const items = [
          d.hotelsPending > 0 && `${d.hotelsPending} hotel`,
          d.vehiclesPending > 0 && `${d.vehiclesPending} vehicle`,
          d.tripCaptainStatus === 'UNASSIGNED' && 'trip captain',
        ].filter(Boolean);
        if (items.length === 0) return <span className="text-xs text-emerald-600">All set</span>;
        return (
          <div className="flex items-center gap-1 text-xs text-amber-600">
            <AlertCircle className="w-3.5 h-3.5" />
            {items.join(', ')}
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (d) => (
        <span className={cn('badge', STATUS_BADGE[d.status])}>{d.status}</span>
      ),
    },
    {
      key: 'action',
      header: '',
      render: (d) => (
        <div className="flex items-center justify-end gap-2">
          {isAdmin && d.bookingCount === 0 && (
            <button
              type="button"
              title="Delete empty departure"
              onClick={(e) => { e.stopPropagation(); setDeleteTarget(d); }}
              className="p-1 text-slate-300 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronRight className="w-4 h-4 text-slate-300" />
        </div>
      ),
      className: 'text-right',
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Departures</h2>
        <p className="text-sm text-slate-500 mt-0.5">Every trip, grouped by departure date</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search by destination..."
          className="input py-1.5 text-sm max-w-xs"
        />
        <select value={status} onChange={(e) => handleStatus(e.target.value)} className="input py-1.5 text-sm w-auto min-w-[140px]">
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className="card">
        <Table
          columns={columns}
          data={departures}
          loading={isLoading}
          emptyMessage="No departures found — confirmed Sales bookings with a departure date will appear here automatically."
          onRowClick={(d) => navigate(`${base}/departures/${d.id}`)}
        />
      </div>

      {meta && meta.totalPages > 1 && (
        <Pagination page={page} totalPages={meta.totalPages} onPageChange={setPage} />
      )}

      <DeleteDepartureReasonModal
        open={!!deleteTarget}
        departureLabel={deleteTarget ? `${deleteTarget.destination} — ${formatDatePretty(deleteTarget.departureDate)}` : undefined}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
        isLoading={deleteDeparture.isPending}
      />
    </div>
  );
}
