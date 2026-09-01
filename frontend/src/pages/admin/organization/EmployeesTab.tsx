import { useState } from 'react';
import {
  Plus, Edit, Trash2, TrendingUp, Search, Copy, Check, KeyRound,
  Mail, Phone, ToggleLeft, ToggleRight, Users, Filter,
} from 'lucide-react';
import {
  useUsers, useCreateUser, useUpdateUser, useDeleteUser,
  useEmployeePerformance, useResetEmployeePassword,
} from '../../../hooks/useUsers';
import { useDepartments } from '../../../hooks/useDepartments';
import { useDesignations } from '../../../hooks/useDesignations';
import { User, EmployeePerformance } from '../../../types/index';
import { useForm, useWatch } from 'react-hook-form';
import Modal from '../../../components/ui/Modal';
import Avatar from '../../../components/ui/Avatar';
import AvailabilityBadge from '../../../components/ui/AvailabilityBadge';
import EmployeeProfileModal from '../../../components/employees/EmployeeProfileModal';
import { Skeleton } from '../../../components/ui/Skeleton';
import { formatDate, cn } from '../../../utils/helpers';
import toast from 'react-hot-toast';

interface ActiveWorkSummary {
  leads: number;
  campaigns: number;
  tasks: number;
  departments: number;
  total: number;
}

interface UserForm {
  name: string;
  email: string;
  password?: string;
  phone?: string;
  role: 'ADMIN' | 'EMPLOYEE' | 'OPERATIONS' | 'FINANCE';
  departmentId?: string;
  designationId?: string;
}

// ─── Employee Form Modal ──────────────────────────────────────────────────────

function EmployeeFormModal({
  open, onClose, defaultValues, onSubmit, isLoading, isEdit,
}: {
  open: boolean; onClose: () => void; defaultValues?: Partial<User>;
  onSubmit: (data: UserForm) => void; isLoading: boolean; isEdit: boolean;
}) {
  const { data: deptData } = useDepartments({ status: 'ACTIVE' });
  const departments = deptData?.data ?? [];

  const { register, handleSubmit, control, setValue, formState: { errors } } = useForm<UserForm>({
    defaultValues: {
      name: defaultValues?.name ?? '',
      email: defaultValues?.email ?? '',
      phone: defaultValues?.phone ?? '',
      role: defaultValues?.role ?? 'EMPLOYEE',
      departmentId: defaultValues?.departmentId ?? '',
      designationId: defaultValues?.designationId ?? '',
    },
  });

  const selectedDeptId = useWatch({ control, name: 'departmentId' });
  const { data: desigData } = useDesignations({ departmentId: selectedDeptId || undefined, status: 'ACTIVE' });
  const designations = desigData?.data ?? [];

  // Each role maps to the department seeded specifically for it (see
  // backend/src/utils/seed.ts). Matched by department code, not name, since
  // codes are stable identifiers while names could be relabeled later.
  const ROLE_DEPARTMENT_CODE: Record<UserForm['role'], string> = {
    EMPLOYEE: 'SALES', OPERATIONS: 'OPS', FINANCE: 'FINANCE', ADMIN: 'ADMIN',
  };

  const handleRoleChange = (role: UserForm['role']) => {
    setValue('role', role);
    // A fresh, deliberate email must be typed for whoever this account is
    // actually for — clearing on every role change stops a value left over
    // from picking the wrong role (or a browser autofill) from silently
    // riding along into the wrong account.
    if (!isEdit) setValue('email', '');
    const match = departments.find((d) => d.code === ROLE_DEPARTMENT_CODE[role]);
    setValue('departmentId', match?.id ?? '');
    setValue('designationId', '');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Employee' : 'Add Employee'}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button form="employee-form" type="submit" disabled={isLoading} className="btn-primary">
            {isLoading ? 'Saving…' : isEdit ? 'Update' : 'Add Employee'}
          </button>
        </>
      }
    >
      <form id="employee-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Full Name *</label>
            <input {...register('name', { required: 'Name is required' })} className="input" placeholder="Employee name" />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="label">Email *</label>
            <input
              {...register('email', { required: 'Email is required' })}
              type="email" className="input" placeholder="email@example.com"
              autoComplete="off"
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <label className="label">Phone *</label>
            <input
              {...register('phone', { required: 'Mobile number is required' })}
              className="input" placeholder="+91 98765 43210"
              autoComplete="off"
            />
            {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
          </div>
          {!isEdit && (
            <div className="sm:col-span-2">
              <label className="label">Password *</label>
              <input
                {...register('password', { required: !isEdit, minLength: { value: 8, message: 'Min 8 characters' } })}
                type="password" className="input" placeholder="Minimum 8 characters"
                autoComplete="new-password"
              />
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>
          )}
          <div>
            <label className="label">Role</label>
            <select {...register('role')} onChange={(e) => handleRoleChange(e.target.value as UserForm['role'])} className="input">
              <option value="EMPLOYEE">Sales</option>
              <option value="OPERATIONS">Operations</option>
              <option value="FINANCE">Finance</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div>
            <label className="label">Department</label>
            <select {...register('departmentId')} className="input">
              <option value="">No Department</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <p className="text-[10px] text-slate-400 mt-0.5">Auto-filled from Role — change if needed.</p>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Designation</label>
            <select {...register('designationId')} className="input" disabled={!selectedDeptId}>
              <option value="">{selectedDeptId ? 'Select designation…' : 'Select department first'}</option>
              {designations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ─── Helper modals (unchanged from original) ──────────────────────────────────

function ResetPasswordModal({ open, onClose, user }: { open: boolean; onClose: () => void; user: User | null }) {
  const [newPassword, setNewPassword] = useState('');
  const [show, setShow] = useState(false);
  const resetPassword = useResetEmployeePassword();
  const handleSubmit = () => {
    if (!user || newPassword.length < 8) return;
    resetPassword.mutate({ id: user.id, newPassword }, { onSuccess: () => { onClose(); setNewPassword(''); setShow(false); } });
  };
  return (
    <Modal open={open} onClose={onClose} title="Reset Password" size="sm"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={handleSubmit} disabled={newPassword.length < 8 || resetPassword.isPending} className="btn-primary">
          {resetPassword.isPending ? 'Resetting…' : 'Reset Password'}
        </button>
      </>}
    >
      {user && (
        <div className="space-y-4">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-sm font-semibold text-slate-800">{user.name}</p>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>
          <div>
            <label className="label">New Password *</label>
            <div className="relative">
              <input type={show ? 'text' : 'password'} value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)} className="input pr-10" placeholder="Minimum 8 characters" />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                {show ? '🙈' : '👁'}
              </button>
            </div>
            {newPassword.length > 0 && newPassword.length < 8 && <p className="text-red-500 text-xs mt-1">Minimum 8 characters</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}

function CredentialsModal({ open, onClose, email, password }: { open: boolean; onClose: () => void; email: string; password: string }) {
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);
  const copy = (text: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text); setter(true); setTimeout(() => setter(false), 2000);
  };
  return (
    <Modal open={open} onClose={onClose} title="Account Created" size="sm" footer={<button onClick={onClose} className="btn-primary">Done</button>}>
      <div className="space-y-4">
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
          <p className="text-sm font-semibold text-emerald-800">Employee account created successfully.</p>
          <p className="text-xs text-emerald-700 mt-0.5">Share these login credentials with the employee.</p>
        </div>
        <div className="space-y-3">
          <div><label className="label">Email</label>
            <div className="flex items-center gap-2">
              <input readOnly value={email} className="input text-sm bg-slate-50 flex-1" />
              <button onClick={() => copy(email, setCopiedEmail)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 flex-shrink-0">
                {copiedEmail ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div><label className="label">Password</label>
            <div className="flex items-center gap-2">
              <input readOnly value={password} className="input text-sm bg-slate-50 flex-1 font-mono" />
              <button onClick={() => copy(password, setCopiedPass)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 flex-shrink-0">
                {copiedPass ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-400">This is the only time the password will be shown.</p>
      </div>
    </Modal>
  );
}

function PerformanceModal({ open, onClose, employee }: { open: boolean; onClose: () => void; employee: EmployeePerformance | null }) {
  if (!employee) return null;
  const rate = parseFloat(employee.conversionRate);
  return (
    <Modal open={open} onClose={onClose} title="Performance" size="sm" footer={<button onClick={onClose} className="btn-secondary">Close</button>}>
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar name={employee.name} size="lg" />
          <div><p className="font-bold text-slate-900">{employee.name}</p><p className="text-sm text-slate-500">{employee.email}</p></div>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { label: 'Total', value: employee.total, color: 'text-slate-800' },
            { label: 'Active', value: employee.active, color: 'text-primary-700' },
            { label: 'Confirmed', value: employee.confirmed, color: 'text-emerald-700' },
            { label: 'Lost', value: employee.lost, color: 'text-red-700' },
            { label: 'Overdue', value: employee.overdue, color: 'text-orange-700' },
            { label: 'Conversion', value: `${employee.conversionRate}%`, color: rate >= 50 ? 'text-emerald-700' : rate >= 25 ? 'text-amber-700' : 'text-red-700' },
          ].map((item) => (
            <div key={item.label} className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
              <p className={cn('text-xl font-bold tabular', item.color)}>{item.value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ─── Employee Card ────────────────────────────────────────────────────────────

function EmployeeCard({
  user, perf, onProfile, onPerf, onEdit, onDelete, onResetPass, onToggleActive,
}: {
  user: User; perf?: EmployeePerformance;
  onProfile: () => void; onPerf: () => void; onEdit: () => void;
  onDelete: () => void; onResetPass: () => void; onToggleActive: () => void;
}) {
  const rate = perf ? parseFloat(perf.conversionRate) : 0;
  const isAdmin = user.role === 'ADMIN';

  return (
    <div className={cn('card p-5 flex flex-col gap-4 hover:shadow-md transition-all duration-200', !user.isActive && 'opacity-60')}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onProfile} className="flex-shrink-0">
            <Avatar name={user.name} size="md" className="ring-2 ring-white shadow-sm" />
          </button>
          <div className="min-w-0">
            {user.employeeId && (
              <p className="text-[10px] font-mono text-slate-400 mb-0.5">{user.employeeId}</p>
            )}
            <button
              onClick={onProfile}
              className="font-bold text-slate-900 text-sm hover:text-primary-600 transition-colors text-left truncate block w-full"
            >
              {user.name}
            </button>
            <div className="flex flex-wrap items-center gap-1 mt-1">
              <span className={cn('badge text-[10px] px-2 py-0.5', isAdmin ? 'bg-mountain-100 text-mountain-700' : 'bg-primary-100 text-primary-700')}>
                {user.role}
              </span>
              {user.designation && (
                <span className="badge text-[10px] px-2 py-0.5 bg-violet-100 text-violet-700">
                  {user.designation.name}
                </span>
              )}
              {user.department && (
                <span className="badge text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600">
                  {user.department.name}
                </span>
              )}
              <AvailabilityBadge status={user.availability} size="xs" showLabel={false} />
              {!user.isActive && <span className="badge text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500">Inactive</span>}
            </div>
          </div>
        </div>
        {/* Actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {perf && <button onClick={onPerf} className="btn-ghost p-1.5" title="Performance"><TrendingUp className="w-3.5 h-3.5" /></button>}
          <button onClick={onResetPass} className="btn-ghost p-1.5" title="Reset password"><KeyRound className="w-3.5 h-3.5" /></button>
          <button onClick={onEdit} className="btn-ghost p-1.5" title="Edit"><Edit className="w-3.5 h-3.5" /></button>
          <button onClick={onDelete} className="btn-ghost p-1.5 hover:text-red-600" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* Contact */}
      <div className="space-y-1.5">
        <a href={`mailto:${user.email}`} className="flex items-center gap-2 text-xs text-slate-500 hover:text-primary-600 transition-colors">
          <Mail className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate">{user.email}</span>
        </a>
        {user.phone && (
          <a href={`tel:${user.phone}`} className="flex items-center gap-2 text-xs text-slate-500 hover:text-primary-600 transition-colors">
            <Phone className="w-3.5 h-3.5 flex-shrink-0" />{user.phone}
          </a>
        )}
      </div>

      {/* Stats */}
      {perf && (
        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
          <div className="text-center">
            <p className="text-base font-bold text-slate-800 tabular">{perf.total}</p>
            <p className="text-[10px] text-slate-400">Leads</p>
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-emerald-700 tabular">{perf.confirmed}</p>
            <p className="text-[10px] text-slate-400">Confirmed</p>
          </div>
          <div className="text-center">
            <p className={cn('text-base font-bold tabular', rate >= 50 ? 'text-emerald-700' : rate >= 25 ? 'text-amber-600' : 'text-red-600')}>
              {perf.conversionRate}%
            </p>
            <p className="text-[10px] text-slate-400">Conv.</p>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <span className="text-[10px] text-slate-400">Joined {formatDate(user.createdAt)}</span>
        <button
          onClick={onToggleActive}
          className={cn('flex items-center gap-1.5 text-xs font-medium transition-colors',
            user.isActive ? 'text-emerald-600 hover:text-red-500' : 'text-slate-400 hover:text-emerald-600')}
        >
          {user.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
          {user.isActive ? 'Active' : 'Inactive'}
        </button>
      </div>
    </div>
  );
}

// ─── Tab ─────────────────────────────────────────────────────────────────────

export default function EmployeesTab() {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [desigFilter, setDesigFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [activeWork, setActiveWork] = useState<ActiveWorkSummary | null>(null);
  const [reassignToId, setReassignToId] = useState('');
  const [perfEmployee, setPerfEmployee] = useState<EmployeePerformance | null>(null);
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null);
  const [resetPassUser, setResetPassUser] = useState<User | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  const { data, isLoading } = useUsers({
    search: search || undefined, limit: 100,
    departmentId: deptFilter || undefined,
    designationId: desigFilter || undefined,
  });
  const { data: perfData } = useEmployeePerformance();
  const { data: deptData } = useDepartments({ status: 'ACTIVE' });
  const { data: desigData } = useDesignations({ departmentId: deptFilter || undefined, status: 'ACTIVE' });

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const users = data?.data ?? [];
  const performance = perfData?.data ?? [];
  const departments = deptData?.data ?? [];
  const designations = desigData?.data ?? [];
  const getPerf = (id: string) => performance.find((p) => p.id === id);

  const handleCreate = (formData: UserForm) => {
    createUser.mutate(formData as any, {
      onSuccess: () => {
        setCreateOpen(false);
        setCreatedCreds({ email: formData.email, password: formData.password! });
      },
    });
  };

  const handleEdit = (formData: UserForm) => {
    if (!editUser) return;
    updateUser.mutate({ id: editUser.id, ...formData } as any, { onSuccess: () => setEditUser(null) });
  };

  const closeDeleteModal = () => {
    setDeleteUserId(null);
    setActiveWork(null);
    setReassignToId('');
  };

  const handleDelete = () => {
    if (!deleteUserId) return;
    deleteUser.mutate(
      { id: deleteUserId, reassignToId: reassignToId || undefined },
      {
        onSuccess: closeDeleteModal,
        onError: (err: any) => {
          const data = err?.response?.data;
          // 409 = still has active work — switch the modal into "pick
          // someone to hand it all to" mode instead of just failing.
          if (err?.response?.status === 409 && data?.activeWork) {
            setActiveWork(data.activeWork);
          } else {
            toast.error(data?.error || 'Failed to remove employee');
          }
        },
      }
    );
  };

  const deletingUser = users.find((u) => u.id === deleteUserId) ?? null;
  const reassignCandidates = users.filter((u) => u.id !== deleteUserId && u.isActive);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="card flex items-center gap-2.5 px-4 py-2.5 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or phone…"
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-slate-400"
          />
        </div>
        {departments.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={deptFilter}
              onChange={(e) => { setDeptFilter(e.target.value); setDesigFilter(''); }}
              className="input py-2 text-sm w-auto min-w-[150px]"
            >
              <option value="">All Departments</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        )}
        {designations.length > 0 && (
          <select
            value={desigFilter} onChange={(e) => setDesigFilter(e.target.value)}
            className="input py-2 text-sm w-auto min-w-[150px]"
          >
            <option value="">All Designations</option>
            {designations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        <div className="ml-auto">
          <button onClick={() => setCreateOpen(true)} className="btn-primary gap-2">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Employee</span>
          </button>
        </div>
      </div>

      {/* Summary */}
      {users.length > 0 && (
        <p className="text-xs text-slate-500 px-1">
          {users.length} employee{users.length !== 1 ? 's' : ''}
          {deptFilter && departments.find(d => d.id === deptFilter) ? ` in ${departments.find(d => d.id === deptFilter)!.name}` : ''}
        </p>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card p-5 space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-16" />
                </div>
              </div>
              <Skeleton className="h-3 w-full" />
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-10 rounded-xl" /><Skeleton className="h-10 rounded-xl" /><Skeleton className="h-10 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Users className="empty-state-icon" />
            <p className="empty-state-title">No employees found</p>
            <p className="empty-state-body">{search ? 'Try a different search term.' : 'Add your first team member to get started.'}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {users.map((u) => (
            <EmployeeCard
              key={u.id} user={u} perf={getPerf(u.id)}
              onProfile={() => setProfileUserId(u.id)}
              onPerf={() => { const p = getPerf(u.id); if (p) setPerfEmployee(p); }}
              onEdit={() => setEditUser(u)}
              onDelete={() => setDeleteUserId(u.id)}
              onResetPass={() => setResetPassUser(u)}
              onToggleActive={() => updateUser.mutate({ id: u.id, isActive: !u.isActive })}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <EmployeeFormModal open={createOpen} onClose={() => setCreateOpen(false)} onSubmit={handleCreate} isLoading={createUser.isPending} isEdit={false} />

      {editUser && (
        <EmployeeFormModal open={!!editUser} onClose={() => setEditUser(null)} defaultValues={editUser}
          onSubmit={handleEdit} isLoading={updateUser.isPending} isEdit />
      )}

      <Modal open={!!deleteUserId} onClose={closeDeleteModal} title="Remove Employee" size="sm"
        footer={<>
          <button onClick={closeDeleteModal} className="btn-secondary">Cancel</button>
          <button
            onClick={handleDelete}
            disabled={deleteUser.isPending || (!!activeWork && !reassignToId)}
            className="btn-danger"
          >
            {deleteUser.isPending ? (activeWork ? 'Reassigning…' : 'Removing…') : activeWork ? 'Reassign & Remove' : 'Remove'}
          </button>
        </>}
      >
        {!activeWork ? (
          <p className="text-sm text-slate-600">Are you sure you want to remove {deletingUser?.name ?? 'this employee'}? This action cannot be undone.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              <strong>{deletingUser?.name}</strong> still has active work assigned to them:
            </p>
            <ul className="text-sm text-slate-700 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
              {activeWork.leads > 0 && <li>• {activeWork.leads} lead{activeWork.leads === 1 ? '' : 's'}</li>}
              {activeWork.campaigns > 0 && <li>• {activeWork.campaigns} campaign membership{activeWork.campaigns === 1 ? '' : 's'}</li>}
              {activeWork.tasks > 0 && <li>• {activeWork.tasks} task{activeWork.tasks === 1 ? '' : 's'}</li>}
              {activeWork.departments > 0 && <li>• Head of {activeWork.departments} department{activeWork.departments === 1 ? '' : 's'}</li>}
            </ul>
            <div>
              <label className="label">Reassign everything to *</label>
              <select value={reassignToId} onChange={(e) => setReassignToId(e.target.value)} className="input">
                <option value="">Select an employee…</option>
                {reassignCandidates.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <p className="text-xs text-slate-400">Only then can {deletingUser?.name} be removed.</p>
          </div>
        )}
      </Modal>

      <PerformanceModal open={!!perfEmployee} onClose={() => setPerfEmployee(null)} employee={perfEmployee} />
      <CredentialsModal open={!!createdCreds} onClose={() => setCreatedCreds(null)} email={createdCreds?.email ?? ''} password={createdCreds?.password ?? ''} />
      <ResetPasswordModal open={!!resetPassUser} onClose={() => setResetPassUser(null)} user={resetPassUser} />
      <EmployeeProfileModal employeeId={profileUserId} onClose={() => setProfileUserId(null)} />
    </div>
  );
}
