import { useState } from 'react';
import { Plus, Edit, Trash2, Users, Building2, ChevronRight, ToggleLeft, ToggleRight } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useDepartments, useCreateDepartment, useUpdateDepartment, useDeleteDepartment } from '../../../hooks/useDepartments';
import { useUsers } from '../../../hooks/useUsers';
import { Department } from '../../../types/index';
import Modal from '../../../components/ui/Modal';
import { Skeleton } from '../../../components/ui/Skeleton';
import { formatDate, cn } from '../../../utils/helpers';

interface DeptForm {
  name: string;
  code: string;
  description?: string;
  headId?: string;
}

function DeptFormModal({
  open, onClose, defaultValues, onSubmit, isLoading, isEdit,
}: {
  open: boolean; onClose: () => void; defaultValues?: Partial<Department>;
  onSubmit: (d: DeptForm) => void; isLoading: boolean; isEdit: boolean;
}) {
  const { data: usersData } = useUsers({ role: 'EMPLOYEE', limit: 100 });
  const employees = usersData?.data ?? [];

  const { register, handleSubmit, formState: { errors } } = useForm<DeptForm>({
    defaultValues: {
      name: defaultValues?.name ?? '',
      code: defaultValues?.code ?? '',
      description: defaultValues?.description ?? '',
      headId: defaultValues?.headId ?? '',
    },
  });

  return (
    <Modal
      open={open} onClose={onClose}
      title={isEdit ? 'Edit Department' : 'New Department'}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button form="dept-form" type="submit" disabled={isLoading} className="btn-primary">
            {isLoading ? 'Saving…' : isEdit ? 'Update' : 'Create'}
          </button>
        </>
      }
    >
      <form id="dept-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="label">Department Name *</label>
          <input {...register('name', { required: 'Name is required' })} className="input" placeholder="e.g. Sales" />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
        </div>
        <div>
          <label className="label">Department Code</label>
          <input {...register('code')} className="input font-mono" placeholder="Auto-generated if left blank (e.g. SALES)" />
          <p className="text-xs text-slate-400 mt-1">Leave blank to auto-generate from name.</p>
        </div>
        <div>
          <label className="label">Description</label>
          <textarea {...register('description')} rows={3} className="input resize-none" placeholder="Brief description of this department…" />
        </div>
        <div>
          <label className="label">Department Head (Optional)</label>
          <select {...register('headId')} className="input">
            <option value="">No Head Assigned</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
      </form>
    </Modal>
  );
}

function DepartmentCard({ dept, onEdit, onDelete, onToggle }: {
  dept: Department; onEdit: () => void; onDelete: () => void; onToggle: () => void;
}) {
  const isActive = dept.status === 'ACTIVE';
  const empCount = dept._count?.employees ?? 0;
  const desigCount = dept._count?.designations ?? 0;

  return (
    <div className={cn('card p-5 flex flex-col gap-4 hover:shadow-md transition-all duration-200', !isActive && 'opacity-60')}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-primary-600" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-slate-900 text-sm truncate">{dept.name}</p>
            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
              {dept.code}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={onEdit} className="btn-ghost p-1.5" title="Edit"><Edit className="w-3.5 h-3.5" /></button>
          <button onClick={onDelete} disabled={empCount > 0} className={cn('btn-ghost p-1.5', empCount > 0 ? 'opacity-30 cursor-not-allowed' : 'hover:text-red-600')} title={empCount > 0 ? 'Has employees' : 'Delete'}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Description */}
      {dept.description && (
        <p className="text-xs text-slate-500 line-clamp-2">{dept.description}</p>
      )}

      {/* Head */}
      {dept.head && (
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span className="text-slate-400">Head:</span>
          <span className="font-medium">{dept.head.name}</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
        <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <Users className="w-3.5 h-3.5 text-primary-500" />
            <p className="text-base font-bold text-slate-800 tabular">{empCount}</p>
          </div>
          <p className="text-[10px] text-slate-400">Employees</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <ChevronRight className="w-3.5 h-3.5 text-mountain-500" />
            <p className="text-base font-bold text-slate-800 tabular">{desigCount}</p>
          </div>
          <p className="text-[10px] text-slate-400">Designations</p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <span className="text-[10px] text-slate-400">Created {formatDate(dept.createdAt)}</span>
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

export default function DepartmentsTab() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editDept, setEditDept] = useState<Department | null>(null);
  const [deleteDeptId, setDeleteDeptId] = useState<string | null>(null);

  const { data, isLoading } = useDepartments();
  const createDept = useCreateDepartment();
  const updateDept = useUpdateDepartment();
  const deleteDept = useDeleteDepartment();

  const departments = data?.data ?? [];

  const handleCreate = (formData: DeptForm) => {
    createDept.mutate(formData, { onSuccess: () => setCreateOpen(false) });
  };

  const handleEdit = (formData: DeptForm) => {
    if (!editDept) return;
    updateDept.mutate({ id: editDept.id, ...formData }, { onSuccess: () => setEditDept(null) });
  };

  const handleDelete = () => {
    if (!deleteDeptId) return;
    deleteDept.mutate(deleteDeptId, { onSuccess: () => setDeleteDeptId(null) });
  };

  const handleToggle = (dept: Department) => {
    updateDept.mutate({ id: dept.id, status: dept.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{departments.length} department{departments.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setCreateOpen(true)} className="btn-primary gap-2">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New Department</span>
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card p-5 space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-xl" />
                <div className="flex-1 space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-12" /></div>
              </div>
              <div className="grid grid-cols-2 gap-2"><Skeleton className="h-14 rounded-xl" /><Skeleton className="h-14 rounded-xl" /></div>
            </div>
          ))}
        </div>
      ) : departments.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Building2 className="empty-state-icon" />
            <p className="empty-state-title">No departments yet</p>
            <p className="empty-state-body">Create your first department to start organizing your team.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {departments.map((d) => (
            <DepartmentCard
              key={d.id} dept={d}
              onEdit={() => setEditDept(d)}
              onDelete={() => setDeleteDeptId(d.id)}
              onToggle={() => handleToggle(d)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <DeptFormModal open={createOpen} onClose={() => setCreateOpen(false)} onSubmit={handleCreate} isLoading={createDept.isPending} isEdit={false} />

      {editDept && (
        <DeptFormModal open={!!editDept} onClose={() => setEditDept(null)} defaultValues={editDept}
          onSubmit={handleEdit} isLoading={updateDept.isPending} isEdit />
      )}

      <Modal open={!!deleteDeptId} onClose={() => setDeleteDeptId(null)} title="Delete Department" size="sm"
        footer={<>
          <button onClick={() => setDeleteDeptId(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleDelete} disabled={deleteDept.isPending} className="btn-danger">
            {deleteDept.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </>}
      >
        <p className="text-sm text-slate-600">Delete this department? This cannot be undone. Departments with employees cannot be deleted.</p>
      </Modal>
    </div>
  );
}
