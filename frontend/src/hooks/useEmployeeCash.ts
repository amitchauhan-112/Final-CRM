import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { PaginatedResponse, EmployeeCashRow, EmployeeCashLedgerEntry } from '../types/index';
import toast from 'react-hot-toast';

// ─── Mine (any authenticated user) ───────────────────────────────────────────

export function useMyCashHolding() {
  return useQuery<{ success: boolean; data: { holding: number; history: EmployeeCashLedgerEntry[] } }>({
    queryKey: ['employee-cash', 'mine'],
    queryFn: async () => (await api.get('/employee-cash/mine')).data,
    refetchInterval: 20000,
  });
}

// ─── Finance/Admin ────────────────────────────────────────────────────────────

export function useEmployeeCashList() {
  return useQuery<{ success: boolean; data: EmployeeCashRow[]; summary: { totalWithEmployees: number; totalCollectedByCompany: number } }>({
    queryKey: ['employee-cash', 'list'],
    queryFn: async () => (await api.get('/employee-cash')).data,
    refetchInterval: 20000,
  });
}

export function useEmployeeCashHistory(employeeId: string | null, page = 1) {
  return useQuery<PaginatedResponse<EmployeeCashLedgerEntry> & { employee: { id: string; name: string }; holding: number }>({
    queryKey: ['employee-cash', 'history', employeeId, page],
    queryFn: async () => (await api.get(`/employee-cash/${employeeId}/history?page=${page}&limit=20`)).data,
    enabled: !!employeeId,
  });
}

export function useCollectEmployeeCash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, amount, notes }: { employeeId: string; amount: number; notes?: string }) => {
      const { data } = await api.post(`/employee-cash/${employeeId}/collect`, { amount, notes });
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['employee-cash'] });
      qc.invalidateQueries({ queryKey: ['finance-dashboard'] });
      toast.success(data?.message || 'Cash collected');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to collect cash'),
  });
}
