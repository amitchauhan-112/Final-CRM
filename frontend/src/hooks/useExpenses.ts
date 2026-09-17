import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { ApiResponse, Expense, Partner, PartnerPaymentSummary } from '../types/index';
import toast from 'react-hot-toast';

export interface ExpenseFilters {
  status?: string; category?: string; departureId?: string; packageId?: string;
}

export function useExpenses(filters: ExpenseFilters = {}) {
  return useQuery<ApiResponse<Expense[]>>({
    queryKey: ['finance', 'expenses', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.category) params.set('category', filters.category);
      if (filters.departureId) params.set('departureId', filters.departureId);
      if (filters.packageId) params.set('packageId', filters.packageId);
      const { data } = await api.get(`/finance/expenses?${params.toString()}`);
      return data;
    },
  });
}

interface CreateExpensePayload {
  category: string; amount: number; description?: string;
  departureId?: string; packageId?: string; vendorId?: string; paidByPartnerId?: string; bill?: File;
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bill, ...payload }: CreateExpensePayload) => {
      const form = new FormData();
      Object.entries(payload).forEach(([k, v]) => { if (v !== undefined && v !== '') form.append(k, String(v)); });
      if (bill) form.append('bill', bill);
      const { data } = await api.post('/finance/expenses', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'expenses'] });
      qc.invalidateQueries({ queryKey: ['finance', 'dashboard'] });
      toast.success('Expense logged for approval');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to log expense'),
  });
}

export function useApproveExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.put(`/finance/expenses/${id}/approve`)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'expenses'] });
      qc.invalidateQueries({ queryKey: ['finance', 'dashboard'] });
      toast.success('Expense approved');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to approve expense'),
  });
}

export function useRejectExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      (await api.put(`/finance/expenses/${id}/reject`, { reason })).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'expenses'] });
      toast.success('Expense rejected');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to reject expense'),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/finance/expenses/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'expenses'] });
      toast.success('Expense removed');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to remove expense'),
  });
}

// ─── Lightweight pickers for tagging an expense to a trip/package ───────────

export function useFinanceDepartures() {
  return useQuery<ApiResponse<Array<{ id: string; destination: string; departureDate: string }>>>({
    queryKey: ['finance', 'departures'],
    queryFn: async () => (await api.get('/finance/departures?limit=100')).data,
  });
}

export function useFinancePackages() {
  return useQuery<ApiResponse<Array<{ id: string; name: string; code: string }>>>({
    queryKey: ['finance', 'packages'],
    queryFn: async () => (await api.get('/finance/packages')).data,
  });
}

// ─── Partners — "who personally paid what" attribution on expenses ─────────

export function usePartners() {
  return useQuery<ApiResponse<Partner[]>>({
    queryKey: ['finance', 'partners'],
    queryFn: async () => (await api.get('/finance/partners')).data,
  });
}

export function useCreatePartner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => (await api.post('/finance/partners', { name })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance', 'partners'] }),
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to add partner'),
  });
}

// Only used within the currently-selected date range on the Reports page —
// mirrors getProfitLossReport's "APPROVED expenses only" rule.
export function usePartnerPaymentsSummary(range: { start?: string; end?: string } = {}) {
  return useQuery<ApiResponse<PartnerPaymentSummary[]>>({
    queryKey: ['finance', 'partners', 'summary', range],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (range.start) params.set('start', range.start);
      if (range.end) params.set('end', range.end);
      const { data } = await api.get(`/finance/partners/summary?${params.toString()}`);
      return data;
    },
  });
}
