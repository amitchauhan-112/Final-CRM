import { useState, useEffect } from 'react';
import { Plus, Search, Trash2, Eye, Edit, RefreshCw, LayoutGrid, List } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useLeads, useCreateLead, useUpdateLead, useDeleteLead } from '../../hooks/useLeads';
import { useCampaigns } from '../../hooks/useCampaigns';
import { useUsers } from '../../hooks/useUsers';
import { Lead, LeadStatus } from '../../types/index';
import Table, { Column } from '../../components/ui/Table';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import LeadForm from '../../components/leads/LeadForm';
import LeadDetail from '../../components/leads/LeadDetail';
import KanbanBoard from '../../components/leads/KanbanBoard';
import Badge from '../../components/ui/Badge';
import Avatar from '../../components/ui/Avatar';
import PriorityBadge from '../../components/ui/PriorityBadge';
import TagChip from '../../components/ui/TagChip';
import { useTags } from '../../hooks/useTags';
import { formatDate, isOverdue, cn } from '../../utils/helpers';
import toast from 'react-hot-toast';

const STATUSES: { value: string; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'NEW', label: 'New' },
  { value: 'NOT_CONTACTED', label: 'Not Contacted' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'INTERESTED', label: 'Interested' },
  { value: 'FOLLOW_UP_SCHEDULED', label: 'Follow-up Scheduled' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'LOST', label: 'Lost' },
];

const SOURCES: { value: string; label: string }[] = [
  { value: '', label: 'All Sources' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'MANUAL', label: 'Manual' },
  { value: 'WEBSITE', label: 'Website' },
];

export default function AdminLeadsPage() {
  const [searchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [source, setSource] = useState('');
  const [priority, setPriority] = useState('');
  const [tagId, setTagId] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

  useEffect(() => {
    const s = searchParams.get('status') || '';
    setStatus(s);
    setPage(1);
  }, [searchParams]);
  const [campaignId, setCampaignId] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [detailLeadId, setDetailLeadId] = useState<string | null>(searchParams.get('id'));

  // Deep-linked from elsewhere (e.g. "view lead" on the Bookings page) — open
  // straight to that lead's detail instead of dropping the user on the full list.
  useEffect(() => {
    const id = searchParams.get('id');
    if (id) setDetailLeadId(id);
  }, [searchParams]);
  const [deleteLeadId, setDeleteLeadId] = useState<string | null>(null);
  const [bulkSelected, setBulkSelected] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<LeadStatus>('CONTACTED');

  const filters = { page, limit: 20, search: search || undefined, status: status || undefined, source: source || undefined, campaignId: campaignId || undefined, assignedToId: assignedToId || undefined, priority: priority || undefined, tagId: tagId || undefined };
  const kanbanFilters = { page: 1, limit: 300, search: search || undefined, source: source || undefined, campaignId: campaignId || undefined, assignedToId: assignedToId || undefined, priority: priority || undefined, tagId: tagId || undefined };

  const { data, isLoading, refetch } = useLeads(viewMode === 'list' ? filters : kanbanFilters);
  const { data: campaignsData } = useCampaigns({ limit: 100 });
  const { data: usersData } = useUsers({ role: 'EMPLOYEE', limit: 100 });
  const { data: allTags = [] } = useTags();
  const createLead = useCreateLead();
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();

  const leads = data?.data ?? [];
  const meta = data?.meta;
  const campaigns = campaignsData?.data ?? [];
  const employees = usersData?.data ?? [];

  const handleCreate = (formData: any) => {
    createLead.mutate(formData, { onSuccess: () => setCreateOpen(false) });
  };

  const handleEdit = (formData: any) => {
    if (!editLead) return;
    updateLead.mutate({ id: editLead.id, ...formData }, { onSuccess: () => setEditLead(null) });
  };

  const handleDelete = () => {
    if (!deleteLeadId) return;
    deleteLead.mutate(deleteLeadId, { onSuccess: () => setDeleteLeadId(null) });
  };

  const handleBulkUpdate = () => {
    if (bulkSelected.length === 0) return;
    // CONFIRMED leads can't be bulk-moved to earlier statuses — they must go through the booking flow
    const eligibleIds = bulkSelected.filter((id) => {
      const lead = leads.find((l) => l.id === id);
      return lead?.status !== 'CONFIRMED';
    });
    const skipped = bulkSelected.length - eligibleIds.length;
    if (eligibleIds.length === 0) {
      toast.error('All selected leads are confirmed bookings — they cannot be bulk-updated.');
      return;
    }
    Promise.all(eligibleIds.map((id) => updateLead.mutateAsync({ id, status: bulkStatus }))).then(() => {
      setBulkSelected([]);
      if (skipped > 0) {
        toast.success(`Updated ${eligibleIds.length} lead${eligibleIds.length !== 1 ? 's' : ''}. ${skipped} confirmed booking${skipped !== 1 ? 's' : ''} skipped.`);
      } else {
        toast.success(`Updated ${eligibleIds.length} lead${eligibleIds.length !== 1 ? 's' : ''}`);
      }
    });
  };

  const toggleSelect = (id: string) => {
    setBulkSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    setBulkSelected(bulkSelected.length === leads.length ? [] : leads.map((l) => l.id));
  };

  const columns: Column<Lead>[] = [
    {
      key: 'select',
      header: '',
      headerClassName: 'w-10',
      render: (row) => (
        <input
          type="checkbox"
          checked={bulkSelected.includes(row.id)}
          onChange={() => toggleSelect(row.id)}
          onClick={(e) => e.stopPropagation()}
          className="rounded border-slate-300 text-primary-600"
        />
      ),
    },
    {
      key: 'name',
      header: 'Name',
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
      key: 'campaign',
      header: 'Campaign',
      render: (row) => row.campaign ? (
        <span className="text-sm text-slate-600 truncate max-w-[120px] block">{row.campaign.name}</span>
      ) : <span className="text-slate-400">—</span>,
    },
    {
      key: 'assignedTo',
      header: 'Assigned',
      render: (row) => row.assignedTo ? (
        <div className="flex items-center gap-1.5">
          <Avatar name={row.assignedTo.name} size="xs" />
          <span className="text-sm">{row.assignedTo.name}</span>
        </div>
      ) : <span className="text-slate-400">—</span>,
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
            onClick={() => setDetailLeadId(row.id)}
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
          <button
            onClick={() => setDeleteLeadId(row.id)}
            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Leads</h2>
          <p className="page-subtitle">{meta?.total ?? 0} total leads</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setViewMode('list')}
              title="List view"
              className={cn('p-1.5 rounded-lg transition-all', viewMode === 'list' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700')}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              title="Kanban view"
              className={cn('p-1.5 rounded-lg transition-all', viewMode === 'kanban' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700')}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          <button onClick={() => refetch()} className="btn-secondary p-2" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setCreateOpen(true)} className="btn-primary gap-2">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Lead</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by name, phone, email..."
              className="input py-1.5 text-sm"
            />
          </div>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="input py-1.5 text-sm w-auto min-w-[140px]"
          >
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select
            value={source}
            onChange={(e) => { setSource(e.target.value); setPage(1); }}
            className="input py-1.5 text-sm w-auto min-w-[130px]"
          >
            {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select
            value={campaignId}
            onChange={(e) => { setCampaignId(e.target.value); setPage(1); }}
            className="input py-1.5 text-sm w-auto min-w-[150px]"
          >
            <option value="">All Campaigns</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select
            value={assignedToId}
            onChange={(e) => { setAssignedToId(e.target.value); setPage(1); }}
            className="input py-1.5 text-sm w-auto min-w-[140px]"
          >
            <option value="">All Employees</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <select
            value={priority}
            onChange={(e) => { setPriority(e.target.value); setPage(1); }}
            className="input py-1.5 text-sm w-auto min-w-[130px]"
          >
            <option value="">All Priorities</option>
            <option value="HIGH">🔴 High</option>
            <option value="MEDIUM">🟡 Medium</option>
            <option value="LOW">🟢 Low</option>
          </select>
          {allTags.length > 0 && (
            <select
              value={tagId}
              onChange={(e) => { setTagId(e.target.value); setPage(1); }}
              className="input py-1.5 text-sm w-auto min-w-[120px]"
            >
              <option value="">All Tags</option>
              {allTags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </div>

        {/* Bulk actions */}
        {bulkSelected.length > 0 && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-200">
            <span className="text-sm text-slate-600 font-medium">{bulkSelected.length} selected</span>
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value as LeadStatus)}
              className="input py-1 text-sm w-auto min-w-[160px]"
            >
              {STATUSES.slice(1).filter((s) => s.value !== 'CONFIRMED').map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <button onClick={handleBulkUpdate} disabled={updateLead.isPending} className="btn-primary py-1 px-3 text-sm">
              Update Status
            </button>
            <button onClick={() => setBulkSelected([])} className="text-sm text-slate-500 hover:text-slate-700">
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Table / Kanban */}
      {viewMode === 'kanban' ? (
        <KanbanBoard
          leads={leads}
          onOpenDetail={(id) => setDetailLeadId(id)}
          onStatusChange={(id, s) => updateLead.mutate({ id, status: s })}
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200">
              <input
                type="checkbox"
                checked={leads.length > 0 && bulkSelected.length === leads.length}
                onChange={toggleSelectAll}
                className="rounded border-slate-300 text-primary-600"
              />
              <span className="text-xs text-slate-500 font-medium">Select all</span>
            </div>
            <Table
              columns={columns}
              data={leads}
              loading={isLoading}
              emptyMessage="No leads found. Try adjusting your filters."
              onRowClick={(row) => setDetailLeadId(row.id)}
            />
          </div>

          {meta && meta.totalPages > 1 && (
            <Pagination page={page} totalPages={meta.totalPages} onPageChange={setPage} />
          )}
        </>
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

      {/* Delete confirm */}
      <Modal open={!!deleteLeadId} onClose={() => setDeleteLeadId(null)} title="Delete Lead" size="sm">
        <p className="text-slate-600">Are you sure you want to delete this lead? This action cannot be undone.</p>
        <div className="flex justify-end gap-3 mt-4">
          <button onClick={() => setDeleteLeadId(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleDelete} disabled={deleteLead.isPending} className="btn-danger">
            {deleteLead.isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </Modal>

      {/* Detail modal */}
      <LeadDetail
        leadId={detailLeadId}
        open={!!detailLeadId}
        onClose={() => setDetailLeadId(null)}
      />
    </div>
  );
}
