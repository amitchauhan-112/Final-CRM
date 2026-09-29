import { useState } from 'react';
import { Plus, Edit, Trash2, Award, Users, ToggleLeft, ToggleRight, Filter } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useDesignations, useCreateDesignation, useUpdateDesignation, useDeleteDesignation } from '../../../hooks/useDesignations';
import { useDepartments } from '../../../hooks/useDepartments';
import { Designation } from '../../../types/index';
import Modal from '../../../components/ui/Modal';
import { Skeleton } from '../../../components/ui/Skeleton';
import { formatDate, cn } from '../../../utils/helpers';

interface DesigForm {
  name: string;
  departmentId: string;
  description?: string;
}

function DesigFormModal({
  open, onClose, defaultValues, onSubmit, isLoading, isEdit,
}: {
  open: boolean; onClose: () => void; defaultValues?: Partial<Designation>;
  onSubmit: (d: DesigForm) => void; isLoading: boolean; isEdit: boolean;
}) {
  const { data: deptData } = useDepartments({ status: 'ACTIVE' });
  const departments = deptData?.data ?? [];

  const { register, handleSubmit, formState: { errors } } = useForm<DesigForm>({
    defaultValues: {
      name: defaultValues?.name ?? '',
      departmentId: defaultValues?.departmentId ?? '',
      description: defaultValues?.description ?? '',
    },
  });

  return (
    <Modal
      open={open} onClose={onClose}
      title={isEdit ? 'Edit Designation' : 'New Designation'}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button form="desig-form" type="submit" disabled={isLoading} className="btn-primary">
            {isLoading ? 'Saving…' : isEdit ? 'Update' : 'Create'}
          </button>
        </>
      }
    >
      <form id="desig-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="label">Department *</label>
          <select {...register('departmentId', { required: 'Department is required' })} className="input">
            <option value="">Select department…</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          {errors.departmentId && <p className="text-red-500 text-xs mt-1">{errors.departmentId.message}</p>}
        </div>
        <div>
          <label className="label">Designation Name *</label>
          <input {...register('name', { required: 'Name is required' })} className="input" placeholder="e.g. Sales Executive" />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
        </div>
        <div>
          <label className="label">Description</label>
          <textarea {...register('description')} rows={3} className="input resize-none" placeholder="Brief role description…" />
        </div>
      </form>
    </Modal>
  );
}

function DesignationCard({ desig, onEdit, onDelete, onToggle }: {
  desig: Designation; onEdit: () => void; onDelete: () => void; onToggle: () => void;
}) {
  const isActive = desig.status === 'ACTIVE';
  const empCount = desig._count?.employees ?? 0;

  return (
    <div className={cn('card p-4 flex flex-col gap-3 hover:shadow-md transition-all duration-200', !isActive && 'opacity-60')}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-mountain-50 border border-mountain-100 flex items-center justify-center flex-shrink-0">
            <Award className="w-4 h-4 text-mountain-600" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 text-sm truncate">{desig.name}</p>
            {desig.department && (
              <span className="inline-block text-[10px] px-2 py-0.5 bg-primary-50 text-primary-700 rounded-full font-medium mt-0.5">
                {desig.department.name}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={onEdit} className="btn-ghost p-1.5" title="Edit"><Edit className="w-3.5 h-3.5" /></button>
          <button
            onClick={onDelete} disabled={empCount > 0}
            className={cn('btn-ghost p-1.5', empCount > 0 ? 'opacity-30 cursor-not-allowed' : 'hover:text-red-600')}
            title={empCount > 0 ? 'Has employees' : 'Delete'}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Description */}
      {desig.description && (
        <p className="text-xs text-slate-500 line-clamp-2">{desig.description}</p>
      )}

      {/* Employee count */}
      <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-2.5 border border-slate-100">
        <Users className="w-4 h-4 text-slate-400" />
        <p className="text-sm font-bold text-slate-800 tabular">{empCount}</p>
        <p className="text-xs text-slate-400">employee{empCount !== 1 ? 's' : ''}</p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <span className="text-[10px] text-slate-400">{formatDate(desig.createdAt)}</span>
        <button
          onClick={onToggle}
          className={cn('flex items-center gap-1.5 text-xs font-medium transition-colors',
            isActive ? 'text-emerald-600 hover:text-red-500' : 'text-slate-400 hover:text-emerald-600')}
        >
          {isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
          {isActive ? 'Active' : 'Inactive'}
        </button>
      </div>
    </div>
  );
}

export default function DesignationsTab() {
  const [deptFilter, setDeptFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editDesig, setEditDesig] = useState<Designation | null>(null);
  const [deleteDesigId, setDeleteDesigId] = useState<string | null>(null);

  const { data, isLoading } = useDesignations({ departmentId: deptFilter || undefined });
  const { data: deptData } = useDepartments({ status: 'ACTIVE' });
  const createDesig = useCreateDesignation();
  const updateDesig = useUpdateDesignation();
  const deleteDesig = useDeleteDesignation();

  const designations = data?.data ?? [];
  const departments = deptData?.data ?? [];

  const handleCreate = (formData: DesigForm) => {
    createDesig.mutate(formData, { onSuccess: () => setCreateOpen(false) });
  };

  const handleEdit = (formData: DesigForm) => {
    if (!editDesig) return;
    updateDesig.mutate({ id: editDesig.id, ...formData }, { onSuccess: () => setEditDesig(null) });
  };

  const handleDelete = () => {
    if (!deleteDesigId) return;
    deleteDesig.mutate(deleteDesigId, { onSuccess: () => setDeleteDesigId(null) });
  };

  const handleToggle = (desig: Designation) => {
    updateDesig.mutate({ id: desig.id, status: desig.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
  };

  // Group by department for display
  const grouped = designations.reduce<Record<string, { deptName: string; items: Designation[] }>>((acc, d) => {
    const key = d.departmentId;
    if (!acc[key]) acc[key] = { deptName: d.department?.name ?? 'Unknown', items: [] };
    acc[key].items.push(d);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {departments.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="input py-2 text-sm w-auto min-w-[160px]">
              <option value="">All Departments</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        )}
        <p className="text-sm text-slate-500">{designations.length} designation{designations.length !== 1 ? 's' : ''}</p>
        <div className="ml-auto">
          <button onClick={() => setCreateOpen(true)} className="btn-primary gap-2">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Designation</span>
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card p-4 space-y-3">
              <div className="flex items-center gap-2.5">
                <Skeleton className="w-8 h-8 rounded-lg" />
                <div className="flex-1 space-y-1.5"><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-16" /></div>
              </div>
              <Skeleton className="h-10 rounded-lg" />
            </div>
          ))}
        </div>
      ) : designations.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Award className="empty-state-icon" />
            <p className="empty-state-title">No designations yet</p>
            <p className="empty-state-body">Add designations to define roles within your departments.</p>
          </div>
        </div>
      ) : deptFilter ? (
        // Flat grid when filtered by department
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {designations.map((d) => (
            <DesignationCard key={d.id} desig={d}
              onEdit={() => setEditDesig(d)} onDelete={() => setDeleteDesigId(d.id)} onToggle={() => handleToggle(d)} />
          ))}
        </div>
      ) : (
        // Grouped by department
        <div className="space-y-6">
          {Object.entries(grouped).map(([deptId, { deptName, items }]) => (
            <div key={deptId}>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">{deptName}</h3>
                <span className="badge bg-slate-100 text-slate-500 text-[10px]">{items.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {items.map((d) => (
                  <DesignationCard key={d.id} desig={d}
                    onEdit={() => setEditDesig(d)} onDelete={() => setDeleteDesigId(d.id)} onToggle={() => handleToggle(d)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      <DesigFormModal open={createOpen} onClose={() => setCreateOpen(false)} onSubmit={handleCreate} isLoading={createDesig.isPending} isEdit={false} />

      {editDesig && (
        <DesigFormModal open={!!editDesig} onClose={() => setEditDesig(null)} defaultValues={editDesig}
          onSubmit={handleEdit} isLoading={updateDesig.isPending} isEdit />
      )}

      <Modal open={!!deleteDesigId} onClose={() => setDeleteDesigId(null)} title="Delete Designation" size="sm"
        footer={<>
          <button onClick={() => setDeleteDesigId(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleDelete} disabled={deleteDesig.isPending} className="btn-danger">
            {deleteDesig.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </>}
      >
        <p className="text-sm text-slate-600">Delete this designation? Designations with assigned employees cannot be deleted.</p>
      </Modal>
    </div>
  );
}
