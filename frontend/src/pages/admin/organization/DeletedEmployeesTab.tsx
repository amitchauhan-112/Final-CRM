import { useState } from 'react';
import { Search, RotateCcw, Archive, Trash2 } from 'lucide-react';
import { useDeletedUsers, useRestoreUser, useHardDeleteUser } from '../../../hooks/useUsers';
import Table, { Column } from '../../../components/ui/Table';
import Pagination from '../../../components/ui/Pagination';
import Avatar from '../../../components/ui/Avatar';
import Modal from '../../../components/ui/Modal';
import { User } from '../../../types/index';
import { formatDateTime } from '../../../utils/helpers';
import toast from 'react-hot-toast';

export default function DeletedEmployeesTab() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [restoreUserId, setRestoreUserId] = useState<string | null>(null);
  const [purgeUserId, setPurgeUserId] = useState<string | null>(null);

  const { data, isLoading } = useDeletedUsers({ page, limit: 20, search: search || undefined });
  const restoreUser = useRestoreUser();
  const hardDeleteUser = useHardDeleteUser();

  const users = data?.data ?? [];
  const meta = data?.meta;
  const purgingUser = users.find((u) => u.id === purgeUserId) ?? null;

  const handlePurge = () => {
    if (!purgeUserId) return;
    hardDeleteUser.mutate(purgeUserId, {
      onSuccess: () => setPurgeUserId(null),
      onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to permanently delete employee'),
    });
  };

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Avatar name={row.name} size="xs" />
          <div>
            <p className="font-medium text-slate-800">{row.name}</p>
            <p className="text-xs text-slate-400">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'department',
      header: 'Department',
      render: (row) => row.department ? (
        <span className="text-sm text-slate-600">{row.department.name}</span>
      ) : <span className="text-slate-400">—</span>,
    },
    {
      key: 'deletedReason',
      header: 'Reason',
      render: (row) => <span className="text-sm text-slate-700">{row.deletedReason || '—'}</span>,
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
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setRestoreUserId(row.id)} className="btn-secondary text-xs gap-1.5 py-1.5" title="Restore">
            <RotateCcw className="w-3.5 h-3.5" />
            Restore
          </button>
          <button
            onClick={() => setPurgeUserId(row.id)}
            className="btn-ghost p-1.5 hover:text-red-600"
            title="Purge permanently (only works if they have no history on record)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-slate-500">{meta?.total ?? 0} deleted employee{meta?.total === 1 ? '' : 's'} — Admin only</p>
      </div>

      <div className="card p-4">
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or email..."
            className="input pl-9"
          />
        </div>
      </div>

      {!isLoading && users.length === 0 ? (
        <div className="empty-state">
          <Archive className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No deleted employees</p>
        </div>
      ) : (
        <>
          <Table columns={columns} data={users} loading={isLoading} />
          {meta && meta.totalPages > 1 && (
            <Pagination page={meta.page} totalPages={meta.totalPages} onPageChange={setPage} />
          )}
        </>
      )}

      <Modal open={!!restoreUserId} onClose={() => setRestoreUserId(null)} title="Restore Employee" size="sm">
        <p className="text-slate-600">Restore this employee back to the active list? They'll come back deactivated — reactivate them separately from there.</p>
        <div className="flex justify-end gap-3 mt-4">
          <button onClick={() => setRestoreUserId(null)} className="btn-secondary">Cancel</button>
          <button
            onClick={() => restoreUserId && restoreUser.mutate(restoreUserId, { onSuccess: () => setRestoreUserId(null) })}
            disabled={restoreUser.isPending}
            className="btn-primary"
          >
            {restoreUser.isPending ? 'Restoring...' : 'Restore'}
          </button>
        </div>
      </Modal>

      {/* Purge — genuinely irreversible, only ever succeeds for an account
          with no real history on record (see hardDeleteUser on the backend). */}
      <Modal open={!!purgeUserId} onClose={() => setPurgeUserId(null)} title="Permanently Delete Employee" size="sm"
        footer={<>
          <button onClick={() => setPurgeUserId(null)} className="btn-secondary">Cancel</button>
          <button onClick={handlePurge} disabled={hardDeleteUser.isPending} className="btn-danger">
            {hardDeleteUser.isPending ? 'Deleting…' : 'Permanently Delete'}
          </button>
        </>}
      >
        <p className="text-sm text-slate-600">
          <strong>{purgingUser?.name ?? 'This employee'}</strong> and their account will be permanently deleted —
          this cannot be undone. Only possible if they have no leads, payments, or other history on record; if they
          do, this will fail and they'll simply stay here instead.
        </p>
      </Modal>
    </div>
  );
}
