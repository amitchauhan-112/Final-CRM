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

export function useEmployeePerformance() {
  return useQuery<ApiResponse<EmployeePerformance[]>>({
    queryKey: ['employee-performance'],
    queryFn: async () => {
      const { data } = await api.get('/users/performance/employees');
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
      toast.error(err?.response?.data?.message || 'Failed to create user');
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
      toast.error(err?.response?.data?.message || 'Failed to update user');
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['employee-performance'] });
      toast.success('Employee removed successfully');
    },
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
