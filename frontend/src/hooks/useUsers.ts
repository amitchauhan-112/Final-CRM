import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { User, EmployeePerformance, PaginatedResponse, ApiResponse } from '../types/index';
import toast from 'react-hot-toast';

export interface UserFilters {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  isActive?: boolean;
  departmentId?: string;
  designationId?: string;
}

export function useUsers(filters: UserFilters = {}) {
  return useQuery<PaginatedResponse<User>>({
    queryKey: ['users', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== '') params.append(k, String(v));
      });
      const { data } = await api.get(`/users?${params}`);
      return data;
    },
  });
}

export function useEmployeePerformance(range?: { from?: string; to?: string }) {
  const from = range?.from;
  const to = range?.to;
  return useQuery<ApiResponse<EmployeePerformance[]>>({
    queryKey: ['employee-performance', from, to],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      const { data } = await api.get(`/users/performance/employees${suffix}`);
      return data;
    },
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      name: string;
      email: string;
      password: string;
      role: string;
      phone?: string;
    }) => {
      const { data } = await api.post('/users', payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['employee-performance'] });
      toast.success('User created successfully');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to create user');
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<User> & { id: string; password?: string }) => {
      const { data } = await api.put(`/users/${id}`, payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['employee-performance'] });
      toast.success('User updated successfully');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to update user');
    },
  });
}

// A 409 here means the employee still has active work assigned to them —
// the response's `activeWork` breakdown drives a reassign-first popup
// (EmployeesTab.tsx) rather than a plain error toast, so error handling is
// left entirely to the caller instead of a blanket toast in this hook.
export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reassignToId }: { id: string; reassignToId?: string }) => {
      const { data } = await api.delete(`/users/${id}`, { data: reassignToId ? { reassignToId } : undefined });
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['employee-performance'] });
      // Uses the backend's own message instead of a fixed string — it
      // already says accurately whether this was a plain deactivation or a
      // "work reassigned, then deactivated" one.
      toast.success(data?.message || 'Employee deactivated');
    },
  });
}

// Permanent, unrecoverable — only ever succeeds for an employee with no
// real history (see hardDeleteUser's comment on the backend). Left without
// a blanket onError toast for the same reason as useDeleteUser: a 400
// ("deactivate first") or 409 (has historical records) both need their
// specific message shown, which the caller reads off the thrown error.
export function useHardDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/users/${id}/permanent`);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['deleted-users'] });
      qc.invalidateQueries({ queryKey: ['employee-performance'] });
      toast.success(data?.message || 'Employee permanently deleted');
    },
  });
}

// ─── Soft delete / Deleted Employees (recovery view) ─────────────────────────
// Mirrors the Lead soft-delete pattern exactly: the employee disappears from
// every normal list/picker but the row stays intact, so past activity logs,
// payments, comments, etc. keep reading their real name. Reversible via
// useRestoreUser. Left without a blanket onError toast, same reason as
// useDeleteUser above — a 400 ("deactivate first") needs its own message.
export function useSoftDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data } = await api.delete(`/users/${id}/soft`, { data: { reason } });
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['deleted-users'] });
      qc.invalidateQueries({ queryKey: ['employee-performance'] });
      toast.success(data?.message || 'Employee deleted');
    },
  });
}

export interface DeletedUserFilters {
  search?: string;
  page?: number;
  limit?: number;
}

export function useDeletedUsers(filters: DeletedUserFilters = {}) {
  return useQuery<PaginatedResponse<User>>({
    queryKey: ['deleted-users', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      params.set('page', String(filters.page ?? 1));
      params.set('limit', String(filters.limit ?? 20));
      const { data } = await api.get(`/users/deleted?${params}`);
      return data;
    },
  });
}

export function useRestoreUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.put(`/users/${id}/restore`);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['deleted-users'] });
      qc.invalidateQueries({ queryKey: ['employee-performance'] });
      toast.success(data?.message || 'Employee restored');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to restore employee'),
  });
}

export function useResetEmployeePassword() {
  return useMutation({
    mutationFn: async ({ id, newPassword }: { id: string; newPassword: string }) => {
      const { data } = await api.put(`/users/${id}/reset-password`, { newPassword });
      return data;
    },
    onSuccess: () => {
      toast.success('Password reset successfully');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to reset password');
    },
  });
}
