import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, RotateCcw, Archive, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDeletedLeads, useRestoreLead } from '../../hooks/useLeads';
import { exportDeletedLeadsToExcel } from '../../utils/export';
import Table, { Column } from '../../components/ui/Table';
import Pagination from '../../components/ui/Pagination';
import Avatar from '../../components/ui/Avatar';
import Modal from '../../components/ui/Modal';
import { Lead } from '../../types/index';
import { formatDateTime } from '../../utils/helpers';

export default function DeletedLeadsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [restoreLeadId, setRestoreLeadId] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useDeletedLeads({ page, limit: 20, search: search || undefined });
  const restoreLead = useRestoreLead();

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportDeletedLeadsToExcel();
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const leads = data?.data ?? [];
  const meta = data?.meta;

  const columns: Column<Lead>[] = [
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
      key: 'campaign',
      header: 'Campaign',
      render: (row) => row.campaign ? (
        <span className="text-sm text-slate-600">{row.campaign.name}</span>
      ) : <span className="text-slate-400">—</span>,
    },
    {
      key: 'deletedReason',
      header: 'Reason',
      render: (row) => (
        <span className="text-sm text-slate-700">{row.deletedReason || '—'}</span>
      ),
    },
    {
      key: 'deletedByUser',
      header: 'Deleted By',
      render: (row) => row.deletedByUser ? (
        <div className="flex items-center gap-1.5">
          <Avatar name={row.deletedByUser.name} size="xs" />
          <span className="text-sm">{row.deletedByUser.name}</span>
        </div>
      ) : <span className="text-slate-400">—</span>,
    },
    {
      key: 'deletedAt',
      header: 'Deleted At',
      render: (row) => <span className="text-xs text-slate-500">{formatDateTime(row.deletedAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setRestoreLeadId(row.id)}
            className="btn-secondary text-xs gap-1.5 py-1.5"
            title="Restore"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restore
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin/leads')} className="btn-secondary p-2" title="Back to Leads">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="page-title">Deleted Leads</h2>
            <p className="page-subtitle">{meta?.total ?? 0} deleted lead{meta?.total === 1 ? '' : 's'} — Admin only</p>
          </div>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || (meta?.total ?? 0) === 0}
          className="btn-secondary gap-2 disabled:opacity-50"
          title="Download all deleted leads (with reason, who deleted, when)"
        >
          <Download className="w-4 h-4" />
          {exporting ? 'Exporting…' : 'Export'}
        </button>
      </div>

      <div className="card p-4">
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name, phone, or email..."
            className="input pl-9"
          />
        </div>
      </div>

      {!isLoading && leads.length === 0 ? (
        <div className="empty-state">
          <Archive className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No deleted leads</p>
        </div>
      ) : (
        <>
          <Table columns={columns} data={leads} loading={isLoading} />
          {meta && meta.totalPages > 1 && (
            <Pagination page={meta.page} totalPages={meta.totalPages} onPageChange={setPage} />
          )}
        </>
      )}

      <Modal open={!!restoreLeadId} onClose={() => setRestoreLeadId(null)} title="Restore Lead" size="sm">
        <p className="text-slate-600">Restore this lead back to the active Leads list?</p>
        <div className="flex justify-end gap-3 mt-4">
          <button onClick={() => setRestoreLeadId(null)} className="btn-secondary">Cancel</button>
          <button
            onClick={() => restoreLeadId && restoreLead.mutate(restoreLeadId, { onSuccess: () => setRestoreLeadId(null) })}
            disabled={restoreLead.isPending}
            className="btn-primary"
          >
            {restoreLead.isPending ? 'Restoring...' : 'Restore'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
