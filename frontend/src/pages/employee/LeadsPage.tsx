import { useState, useEffect } from 'react';
import { Search, Plus, Eye, Edit, RefreshCw, Star } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useLeads, useCreateLead, useUpdateLead, usePreferredDateSummary } from '../../hooks/useLeads';
import { Lead } from '../../types/index';
import { useAuthStore } from '../../store/authStore';
import { useStarredLeads } from '../../hooks/useStarredLeads';
import { useRecentViews } from '../../hooks/useRecentViews';
import Table, { Column } from '../../components/ui/Table';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import LeadForm from '../../components/leads/LeadForm';
import LeadDetail from '../../components/leads/LeadDetail';
import Badge from '../../components/ui/Badge';
import PriorityBadge from '../../components/ui/PriorityBadge';
import TagChip from '../../components/ui/TagChip';
import { formatDate, isOverdue, cn } from '../../utils/helpers';
import DateRangeFilter from '../../components/ui/DateRangeFilter';
import { rangeForDays, RangePreset, DateRange } from '../../utils/dateRange';

// If the incoming dateFrom/dateTo exactly matches one of the presets (as it
// will when arriving from a dashboard stat card), select that pill instead
// of falling back to "Custom" — keeps the two screens visually consistent.
function presetFromParams(dateFrom: string | null, dateTo: string | null): { preset: RangePreset; custom: DateRange } {
  if (!dateFrom || !dateTo) return { preset: '30', custom: rangeForDays(30) };
  for (const days of [30, 60, 90] as const) {
    const r = rangeForDays(days);
    if (r.from === dateFrom && r.to === dateTo) return { preset: String(days) as RangePreset, custom: r };
  }
  return { preset: 'custom', custom: { from: dateFrom, to: dateTo } };
}

const STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'NEW', label: 'New' },
  { value: 'NOT_CONTACTED', label: 'Not Contacted' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'INTERESTED', label: 'Interested' },
  { value: 'FOLLOW_UP_SCHEDULED', label: 'Follow-up Sched.' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'LOST', label: 'Lost' },
];

export default function EmployeeLeadsPage() {
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [preferredDate, setPreferredDate] = useState('');
  const initialRange = presetFromParams(searchParams.get('dateFrom'), searchParams.get('dateTo'));
  const [rangePreset, setRangePreset] = useState<RangePreset>(initialRange.preset);
  const [customRange, setCustomRange] = useState<DateRange>(initialRange.custom);
  const dateRange = rangePreset === 'custom' ? customRange : rangeForDays(Number(rangePreset));

  useEffect(() => {
    const s = searchParams.get('status') || '';
    setStatus(s);
    const r = presetFromParams(searchParams.get('dateFrom'), searchParams.get('dateTo'));
    setRangePreset(r.preset);
    setCustomRange(r.custom);
    setPage(1);
  }, [searchParams]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [detailLeadId, setDetailLeadId] = useState<string | null>(searchParams.get('id'));

  // Deep-linked from elsewhere (e.g. "view lead" on My Customers) — open
  // straight to that lead's detail instead of dropping the user on the full list.
  useEffect(() => {
    const id = searchParams.get('id');
    if (id) setDetailLeadId(id);
  }, [searchParams]);

  const filters = {
    page,
    limit: 20,
    assignedToId: user?.id,
    search: search || undefined,
    status: status || undefined,
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    preferredDate: preferredDate || undefined,
  };

  const { data, isLoading, refetch } = useLeads(filters);
  const { data: preferredDateSummary } = usePreferredDateSummary();
  const createLead = useCreateLead();
  const updateLead = useUpdateLead();
  const { isStarred, toggle: toggleStar } = useStarredLeads();
  const { trackView } = useRecentViews();

  const openDetail = (id: string) => {
    setDetailLeadId(id);
    trackView(id);
  };

  const leads = data?.data ?? [];
  const meta = data?.meta;

  const handleCreate = (formData: any) => {
    createLead.mutate({ ...formData, assignedToId: user?.id }, { onSuccess: () => setCreateOpen(false) });
  };

  const handleEdit = (formData: any) => {
    if (!editLead) return;
    updateLead.mutate({ id: editLead.id, ...formData }, { onSuccess: () => setEditLead(null) });
  };

  const columns: Column<Lead>[] = [
    {
      key: 'name',
      header: 'Lead',
      render: (row) => (
        <div>
          <p className="font-medium text-slate-800">{row.name}</p>
          <p className="text-xs text-slate-400">{row.phone}</p>
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'P',
      headerClassName: 'w-8',
      render: (row) => <PriorityBadge priority={(row as any).priority ?? 'MEDIUM'} />,
    },
    {
      key: 'source',
      header: 'Source',
      render: (row) => <Badge source={row.source} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge status={row.status} />,
    },
    {
      key: 'tags',
      header: 'Tags',
      render: (row) => {
        const tags = (row as any).tags ?? [];
        if (!tags.length) return null;
        return (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 2).map((lt: any) => (
              <TagChip key={lt.tag?.id ?? lt.id} tag={lt.tag ?? lt} />
            ))}
            {tags.length > 2 && <span className="text-xs text-slate-400">+{tags.length - 2}</span>}
          </div>
        );
      },
    },
    {
      key: 'destination',
      header: 'Destination',
      render: (row) => (
        <span className="text-sm text-slate-600">{row.destination ?? '—'}</span>
      ),
    },
    {
      key: 'campaign',
      header: 'Campaign',
      render: (row) =>
        row.campaign ? (
          <span className="text-xs text-slate-600 truncate max-w-[120px] block">{row.campaign.name}</span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: 'followUpDate',
      header: 'Follow-up',
      render: (row) => {
        if (!row.followUpDate) return <span className="text-slate-400">—</span>;
        if (row.followUpDone) return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 w-fit">
              ✓ Done
            </span>
            <span className="text-xs text-slate-400">{formatDate(row.followUpDate)}</span>
          </div>
        );
        if (isOverdue(row.followUpDate)) return (
          <span className="text-xs font-medium text-red-600">⚠ {formatDate(row.followUpDate)}</span>
        );
        return <span className="text-xs font-medium text-orange-600">{formatDate(row.followUpDate)}</span>;
      },
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row) => <span className="text-xs text-slate-500">{formatDate(row.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => toggleStar(row.id)}
            className="p-1.5 rounded-lg hover:bg-yellow-50 transition-colors"
            title={isStarred(row.id) ? 'Unstar' : 'Star'}
          >
            <Star className={cn('w-4 h-4', isStarred(row.id) ? 'text-yellow-500 fill-yellow-500' : 'text-slate-300 hover:text-yellow-400')} />
          </button>
          <button
            onClick={() => openDetail(row.id)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-primary-600 transition-colors"
            title="View"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => setEditLead(row)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
            title="Edit"
          >
            <Edit className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">My Leads</h2>
          <p className="text-sm text-slate-500 mt-0.5">{meta?.total ?? 0} leads assigned to you</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="btn-secondary p-2" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Lead</span>
          </button>
        </div>
      </div>

      {/* Upcoming interest — surfaces date clusters (e.g. "15 people want Sept 3")
          so a targeted offer can be sent to just that batch instead of everyone. */}
      {(preferredDateSummary?.data?.length ?? 0) > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Upcoming interest:</span>
          {preferredDateSummary!.data.map((entry) => (
            <button
              key={entry.preferredDate}
              onClick={() => { setPreferredDate(preferredDate === entry.preferredDate ? '' : entry.preferredDate); setPage(1); }}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                preferredDate === entry.preferredDate
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-primary-300 hover:text-primary-700'
              )}
            >
              {formatDate(entry.preferredDate)} · {entry.count} lead{entry.count === 1 ? '' : 's'}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by name, phone..."
              className="input py-1.5 text-sm"
            />
          </div>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="input py-1.5 text-sm w-auto min-w-[160px]"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <input
            type="date"
            value={preferredDate}
            onChange={(e) => { setPreferredDate(e.target.value); setPage(1); }}
            title="Filter by interested/preferred departure date"
            className="input py-1.5 text-sm w-auto"
          />
        </div>
        <div className="mt-3 pt-3 border-t border-slate-100">
          <DateRangeFilter
            preset={rangePreset}
            onPresetChange={(p) => { setRangePreset(p); setPage(1); }}
            customRange={customRange}
            onCustomRangeChange={(r) => { setCustomRange(r); setPage(1); }}
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <Table
          columns={columns}
          data={leads}
          loading={isLoading}
          emptyMessage="No leads assigned to you yet"
          onRowClick={(row) => openDetail(row.id)}
        />
      </div>

      {meta && meta.totalPages > 1 && (
        <Pagination page={page} totalPages={meta.totalPages} onPageChange={setPage} />
      )}

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create New Lead" size="2xl">
        <LeadForm
          onSubmit={handleCreate}
          isLoading={createLead.isPending}
          onCancel={() => setCreateOpen(false)}
        />
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editLead} onClose={() => setEditLead(null)} title="Edit Lead" size="2xl">
        {editLead && (
          <LeadForm
            defaultValues={editLead}
            onSubmit={handleEdit}
            isLoading={updateLead.isPending}
            onCancel={() => setEditLead(null)}
          />
        )}
      </Modal>

      {/* Detail modal */}
      <LeadDetail
        leadId={detailLeadId}
        open={!!detailLeadId}
        onClose={() => setDetailLeadId(null)}
        isStarred={detailLeadId ? isStarred(detailLeadId) : false}
        onToggleStar={detailLeadId ? () => toggleStar(detailLeadId) : undefined}
      />
    </div>
  );
}
