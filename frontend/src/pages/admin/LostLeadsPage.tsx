import { useEffect, useState } from 'react';
import { Download, RotateCcw, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import Table, { Column } from '../../components/ui/Table';
import Modal from '../../components/ui/Modal';
import Avatar from '../../components/ui/Avatar';
import { useLostLeads, useReviveLostLeads, fetchLostLeadExportRows, LostLeadRow } from '../../hooks/useLostLeads';
import { useUsers } from '../../hooks/useUsers';
import { exportRowsToCSV, exportRowsToExcel } from '../../utils/reportExport';
import {
  BUCKET_LABEL, LostBucket, formatLostReason, monthLabel, nextPostponeMonths,
} from '../../utils/lostReasons';
import { formatDate } from '../../utils/helpers';

const BUCKETS: LostBucket[] = ['POSTPONED', 'JUNK', 'OTHER'];

// ─── Revive modal ─────────────────────────────────────────────────────────────
// Used for both a single row and a bulk selection. The comment is required
// because it is what the sales person reads when the lead lands back on them.

function ReviveModal({ targets, onClose }: { targets: LostLeadRow[]; onClose: () => void }) {
  const [comment, setComment] = useState('');
  const [assignee, setAssignee] = useState('');
  const [error, setError] = useState('');
  const revive = useReviveLostLeads();
  const { data: usersData } = useUsers({ role: 'EMPLOYEE', limit: 100, isActive: true });
  const employees = usersData?.data ?? [];

  const submit = () => {
    if (!comment.trim()) { setError('Add a comment — the sales person will see it'); return; }
    revive.mutate(
      { leadIds: targets.map((t) => t.id), comment: comment.trim(), assignedToId: assignee || undefined },
      { onSuccess: onClose }
    );
  };

  const preview = targets.slice(0, 5).map((t) => t.name).join(', ');
  const extra = targets.length - 5;

  return (
    <Modal open onClose={onClose} title={targets.length === 1 ? 'Revive Lead' : `Revive ${targets.length} Leads`} size="md">
      <div className="space-y-4">
        <div className="text-sm text-slate-600 bg-slate-50 rounded-xl px-3.5 py-2.5">
          <span className="font-medium text-slate-800">{preview}</span>
          {extra > 0 && <span className="text-slate-500"> and {extra} more</span>}
          <p className="text-xs text-slate-400 mt-1">They move back to NEW and appear in the sales person's Leads list.</p>
        </div>

        <div>
          <label className="label">Comment for the sales person <span className="text-red-500">*</span></label>
          <textarea
            value={comment}
            onChange={(e) => { setComment(e.target.value); setError(''); }}
            rows={3}
            className="input resize-none"
            placeholder="e.g. Customer wants to travel in November — call on 5th, family is deciding."
            autoFocus
          />
          {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>

        <div>
          <label className="label">Assign to</label>
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="input">
            <option value="">Keep current sales person</option>
            {employees.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={submit} disabled={revive.isPending} className="btn-primary gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" />
            {revive.isPending ? 'Reviving…' : `Revive ${targets.length === 1 ? 'Lead' : `${targets.length} Leads`}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LostLeadsPage() {
  const [bucket, setBucket] = useState<LostBucket>('POSTPONED');
  const [month, setMonth] = useState(''); // '' = all postponed, 'DUE' = already arrived, or 'YYYY-MM'
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviveTargets, setReviveTargets] = useState<LostLeadRow[] | null>(null);
  const [exporting, setExporting] = useState(false);

  const filters = {
    bucket,
    month: bucket === 'POSTPONED' && month ? month : undefined,
    search: search.trim() || undefined,
  };
  const { data, isLoading } = useLostLeads(filters);
  const rows = data?.data ?? [];
  const meta = data?.meta;

  // A selection only means something inside the view it was made in.
  useEffect(() => { setSelected(new Set()); }, [bucket, month, search]);

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
  const toggleOne = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectedRows = rows.filter((r) => selected.has(r.id));

  // Postponed sub-tabs: the five upcoming months, plus "Due now" for any month that has arrived.
  const byMonth = meta?.postponedByMonth ?? {};
  const currentMonth = meta?.currentMonth ?? '';
  const dueCount = Object.entries(byMonth).filter(([k]) => k <= currentMonth).reduce((sum, [, v]) => sum + v, 0);
  const upcoming = nextPostponeMonths();
  const extraFuture = Object.keys(byMonth)
    .filter((k) => k > currentMonth && !upcoming.some((u) => u.value === k))
    .sort();
  const monthTabs = [
    ...upcoming.map((u) => ({ value: u.value, label: monthLabel(u.value), count: byMonth[u.value] ?? 0 })),
    ...extraFuture.map((k) => ({ value: k, label: monthLabel(k), count: byMonth[k] })),
  ];

  const handleExport = async (format: 'xlsx' | 'csv') => {
    setExporting(true);
    try {
      const exportRows = await fetchLostLeadExportRows(filters);
      if (exportRows.length === 0) { toast.error('Nothing to export'); return; }
      const label = BUCKET_LABEL[bucket].toLowerCase().replace(/\s+/g, '-');
      const suffix = filters.month ? `-${filters.month}` : '';
      const base = `lost-leads-${label}${suffix}-${new Date().toISOString().slice(0, 10)}`;
      if (format === 'xlsx') exportRowsToExcel(`${base}.xlsx`, exportRows, 'Lost Leads');
      else exportRowsToCSV(`${base}.csv`, exportRows);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<LostLeadRow>[] = [
    {
      key: 'select',
      header: '',
      className: 'w-10',
      render: (row) => (
        <input
          type="checkbox"
          checked={selected.has(row.id)}
          onChange={() => toggleOne(row.id)}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 accent-red-600 cursor-pointer"
          aria-label={`Select ${row.name}`}
        />
      ),
    },
    {
      key: 'name',
      header: 'Lead',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Avatar name={row.name} size="xs" />
          <div>
            <p className="font-medium text-slate-800">{row.name}</p>
            <p className="text-xs text-slate-400">{row.phone}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row) => <span className="text-sm text-slate-700">{formatLostReason(row)}</span>,
    },
    {
      key: 'assignedTo',
      header: 'Sales Person',
      render: (row) => <span className="text-sm text-slate-600">{row.assignedTo?.name ?? '—'}</span>,
    },
    {
      key: 'lostAt',
      header: 'Lost On',
      render: (row) => <span className="text-xs text-slate-500">{row.lostAt ? formatDate(row.lostAt) : '—'}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setReviveTargets([row])} className="btn-secondary text-xs gap-1.5 py-1.5">
            <RotateCcw className="w-3.5 h-3.5" />
            Revive
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h2 className="page-title">Lost Leads</h2>
          <p className="page-subtitle">Junk, postponed and other lost leads — revive them back to a sales person. Admin only</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => handleExport('xlsx')} disabled={exporting || rows.length === 0} className="btn-secondary gap-2 disabled:opacity-50">
            <Download className="w-4 h-4" />
            Excel
          </button>
          <button onClick={() => handleExport('csv')} disabled={exporting || rows.length === 0} className="btn-secondary gap-2 disabled:opacity-50">
            <Download className="w-4 h-4" />
            CSV
          </button>
        </div>
      </div>

      <div className="tabs">
        {BUCKETS.map((b) => (
          <button
            key={b}
            onClick={() => { setBucket(b); setMonth(''); }}
            className={bucket === b ? 'tab-item-active' : 'tab-item'}
          >
            {BUCKET_LABEL[b]} ({meta?.counts?.[b] ?? 0})
          </button>
        ))}
      </div>

      {bucket === 'POSTPONED' && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setMonth('')} className={month === '' ? 'tab-item-active' : 'tab-item'}>
            All ({meta?.counts?.POSTPONED ?? 0})
          </button>
          {dueCount > 0 && (
            <button onClick={() => setMonth('DUE')} className={month === 'DUE' ? 'tab-item-active' : 'tab-item'}>
              Due now ({dueCount})
            </button>
          )}
          {monthTabs.map((m) => (
            <button key={m.value} onClick={() => setMonth(m.value)} className={month === m.value ? 'tab-item-active' : 'tab-item'}>
              Plan in {m.label} ({m.count})
            </button>
          ))}
        </div>
      )}

      <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone..."
            className="input pl-9"
          />
        </div>
        {rows.length > 0 && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
              <input type="checkbox" checked={allChecked} onChange={toggleAll} className="w-4 h-4 accent-red-600" />
              Select all ({rows.length})
            </label>
            <button
              onClick={() => setReviveTargets(selectedRows)}
              disabled={selectedRows.length === 0}
              className="btn-primary gap-1.5 disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Revive selected ({selectedRows.length})
            </button>
          </div>
        )}
      </div>

      {meta?.truncated && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          Showing the first {rows.length} of {meta.total}. Narrow by month or search to see the rest — the export includes up to 5,000.
        </p>
      )}

      <Table
        columns={columns}
        data={rows}
        loading={isLoading}
        emptyMessage={bucket === 'POSTPONED' ? 'No postponed leads here' : `No ${BUCKET_LABEL[bucket].toLowerCase()} leads here`}
        rowClassName={(row) => (selected.has(row.id) ? 'bg-red-50/40' : '')}
      />

      {reviveTargets && <ReviveModal targets={reviveTargets} onClose={() => { setReviveTargets(null); setSelected(new Set()); }} />}
    </div>
  );
}
