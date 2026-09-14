import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePendingTracker } from '../../hooks/useFinance';
import { useUsers } from '../../hooks/useUsers';
import Table, { Column } from '../../components/ui/Table';
import Pagination from '../../components/ui/Pagination';
import { PendingTrackerRow } from '../../types/index';
import { formatCurrency, formatDate, cn } from '../../utils/helpers';

const INDICATOR_STYLE: Record<string, string> = {
  PAID: 'bg-emerald-50 text-emerald-700',
  DUE_SOON: 'bg-amber-50 text-amber-700',
  OVERDUE: 'bg-red-50 text-red-600',
};

export default function PendingTrackerPage() {
  const [searchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [destination, setDestination] = useState('');
  const [salesEmployeeId, setSalesEmployeeId] = useState('');
  const [status, setStatus] = useState(searchParams.get('status') || '');

  // Deep-linked from the Finance Dashboard's Overdue/Upcoming Due cards —
  // pre-select the matching status instead of dropping the user on the
  // full unfiltered list (same fix as the Leads "Overdue" cards).
  useEffect(() => {
    setStatus(searchParams.get('status') || '');
    setPage(1);
  }, [searchParams]);

  const handle = (setter: (v: string) => void) => (v: string) => { setter(v); setPage(1); };

  const { data: usersData } = useUsers({ role: 'EMPLOYEE', limit: 100 } as any);
  const employees = usersData?.data ?? [];

  const { data, isLoading } = usePendingTracker({
    search: search || undefined, destination: destination || undefined,
    salesEmployeeId: salesEmployeeId || undefined, status: status || undefined,
    page, limit: 20,
  });
  const rows = data?.data ?? [];
  const meta = data?.meta;

  const columns: Column<PendingTrackerRow>[] = [
    { key: 'customer', header: 'Customer', render: (r) => (<div><p className="font-medium text-slate-800">{r.customerName}</p><p className="text-xs text-slate-400">{r.phone}</p></div>) },
    { key: 'destination', header: 'Destination', render: (r) => r.destination },
    { key: 'departureDate', header: 'Departure Date', render: (r) => r.departureDate ? formatDate(r.departureDate) : '—' },
    { key: 'pending', header: 'Pending Amount', render: (r) => <span className="font-semibold">{formatCurrency(r.pendingAmount)}</span>, className: 'text-right' },
    { key: 'dueDate', header: 'Due Date', render: (r) => r.dueDate ? formatDate(r.dueDate) : '—' },
    { key: 'days', header: 'Days Remaining', render: (r) => r.daysRemaining === null ? '—' : (r.daysRemaining < 0 ? `${Math.abs(r.daysRemaining)}d overdue` : `${r.daysRemaining}d`) },
    { key: 'sales', header: 'Sales Employee', render: (r) => r.salesEmployee },
    { key: 'status', header: 'Status', render: (r) => <span className={cn('badge', INDICATOR_STYLE[r.indicator])}>{r.indicator.replace('_', ' ')}</span> },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Pending Payment Tracker</h2>
        <p className="text-sm text-slate-500 mt-0.5">All customers with outstanding balances</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input value={search} onChange={(e) => handle(setSearch)(e.target.value)} placeholder="Search customer..." className="input py-1.5 text-sm max-w-xs" />
        <input value={destination} onChange={(e) => handle(setDestination)(e.target.value)} placeholder="Destination..." className="input py-1.5 text-sm w-auto" />
        <select value={salesEmployeeId} onChange={(e) => handle(setSalesEmployeeId)(e.target.value)} className="input py-1.5 text-sm w-auto">
          <option value="">All Sales Employees</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select value={status} onChange={(e) => handle(setStatus)(e.target.value)} className="input py-1.5 text-sm w-auto">
          <option value="">All Statuses</option>
          <option value="PAID">Paid</option>
          <option value="DUE_SOON">Due Soon</option>
          <option value="OVERDUE">Overdue</option>
        </select>
      </div>

      <div className="card">
        <Table columns={columns} data={rows} loading={isLoading} emptyMessage="No pending balances found" />
      </div>

      {meta && meta.totalPages > 1 && <Pagination page={page} totalPages={meta.totalPages} onPageChange={setPage} />}
    </div>
  );
}
