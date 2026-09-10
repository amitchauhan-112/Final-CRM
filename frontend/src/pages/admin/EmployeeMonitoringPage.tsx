import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Users, Radar } from 'lucide-react';
import { useEmployeePerformance } from '../../hooks/useUsers';
import { Skeleton } from '../../components/ui/Skeleton';
import Avatar from '../../components/ui/Avatar';
import { cn } from '../../utils/helpers';
import DateRangeFilter from '../../components/ui/DateRangeFilter';
import { MONITORING_PRESETS, MonitoringPreset, monitoringRange, rangeForDays } from '../../utils/dateRange';

type SortKey = 'total' | 'fresh' | 'notContacted' | 'contacted' | 'interested' | 'followUpScheduled' | 'confirmed' | 'lost' | 'overdue' | 'conversionRate';

// Maps each column to the Lead status its cell should filter the Leads page
// by when clicked — undefined means "no status filter" (just this employee).
// Overdue has no dedicated status of its own; it reuses FOLLOW_UP_SCHEDULED,
// the same convention the Dashboard's "Overdue Follow-ups" card already uses.
const COLUMNS: { key: SortKey; label: string; status?: string }[] = [
  { key: 'total', label: 'Assigned' },
  { key: 'fresh', label: 'Fresh', status: 'NEW' },
  { key: 'notContacted', label: 'Not Contacted', status: 'NOT_CONTACTED' },
  { key: 'contacted', label: 'Contacted', status: 'CONTACTED' },
  { key: 'interested', label: 'Interested', status: 'INTERESTED' },
  { key: 'followUpScheduled', label: 'Follow-up', status: 'FOLLOW_UP_SCHEDULED' },
  { key: 'confirmed', label: 'Confirmed', status: 'CONFIRMED' },
  { key: 'lost', label: 'Lost', status: 'LOST' },
  { key: 'overdue', label: 'Overdue', status: 'FOLLOW_UP_SCHEDULED' },
  { key: 'conversionRate', label: 'Conv. %' },
];

export default function EmployeeMonitoringPage() {
  const navigate = useNavigate();
  const [preset, setPreset] = useState<MonitoringPreset>('today');
  const [customRange, setCustomRange] = useState(rangeForDays(7));
  const range = monitoringRange(preset, customRange);

  const { data, isLoading } = useEmployeePerformance(range);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('total');

  const employees = data?.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? employees.filter((e) => e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q)) : employees;
    return [...list].sort((a, b) => parseFloat(String(b[sortKey])) - parseFloat(String(a[sortKey])));
  }, [employees, search, sortKey]);

  const totals = useMemo(() => COLUMNS.reduce((acc, col) => {
    if (col.key === 'conversionRate') return acc;
    acc[col.key] = employees.reduce((sum, e) => sum + (e[col.key] as number), 0);
    return acc;
  }, {} as Record<string, number>), [employees]);

  const goToLeads = (employeeId: string, status?: string) => {
    const params = new URLSearchParams({ assignedToId: employeeId });
    if (status) params.set('status', status);
    navigate(`/admin/leads?${params.toString()}`);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Radar className="w-5 h-5 text-primary-500" />
          Employee Monitoring
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Each active employee's pipeline for leads received in the selected period, broken down by status — spot who's overloaded, who has stale leads, and who's converting. Click any number to see those leads.
        </p>
      </div>

      <div className="card p-3">
        <DateRangeFilter
          preset={preset}
          onPresetChange={setPreset}
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
          presets={MONITORING_PRESETS}
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee..."
            className="input pl-9 text-sm"
          />
        </div>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="input text-sm w-auto">
          {COLUMNS.map((c) => <option key={c.key} value={c.key}>Sort by {c.label}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="card p-5 space-y-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card py-16 text-center">
          <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No employees found</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Employee</th>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => {
                  const rate = parseFloat(emp.conversionRate);
                  const rateColor = rate >= 50 ? 'text-green-600' : rate >= 25 ? 'text-yellow-600' : 'text-red-500';

                  const Cell = ({ value, status, className }: { value: number; status?: string; className?: string }) => (
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => goToLeads(emp.id, status)}
                        className={cn('text-sm hover:underline hover:opacity-80 transition-opacity', className)}
                        title={`View ${emp.name}'s ${status ? status.replace(/_/g, ' ').toLowerCase() : 'assigned'} leads`}
                      >
                        {value}
                      </button>
                    </td>
                  );

                  return (
                    <tr key={emp.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => goToLeads(emp.id)}
                          className="flex items-center gap-3 min-w-[180px] text-left hover:opacity-80 transition-opacity"
                        >
                          <Avatar name={emp.name} size="sm" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate hover:underline">{emp.name}</p>
                            <p className="text-xs text-slate-400 truncate">{emp.email}</p>
                          </div>
                        </button>
                      </td>
                      <Cell value={emp.total} className="font-semibold text-slate-800" />
                      <Cell value={emp.fresh} status="NEW" className="text-blue-600" />
                      <Cell value={emp.notContacted} status="NOT_CONTACTED" className="text-slate-500" />
                      <Cell value={emp.contacted} status="CONTACTED" className="text-slate-600" />
                      <Cell value={emp.interested} status="INTERESTED" className="text-purple-600" />
                      <Cell value={emp.followUpScheduled} status="FOLLOW_UP_SCHEDULED" className="text-amber-600" />
                      <Cell value={emp.confirmed} status="CONFIRMED" className="font-semibold text-green-600" />
                      <Cell value={emp.lost} status="LOST" className="text-red-500" />
                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={() => goToLeads(emp.id, 'FOLLOW_UP_SCHEDULED')}
                          title={`View ${emp.name}'s follow-up leads`}
                        >
                          {emp.overdue > 0 ? (
                            <span className="badge badge-danger text-xs hover:opacity-80 transition-opacity">{emp.overdue}</span>
                          ) : (
                            <span className="text-sm text-slate-300">0</span>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className={cn('text-sm font-semibold', rateColor)}>{emp.conversionRate}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200">
                  <td className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Total ({filtered.length})</td>
                  {COLUMNS.map((c) => (
                    <td key={c.key} className="px-4 py-3 text-right text-sm font-semibold text-slate-700">
                      {c.key === 'conversionRate' ? '—' : totals[c.key]}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
