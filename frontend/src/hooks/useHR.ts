import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../services/api';

export interface HRUser { id: string; name: string; email: string; role?: string; avatar?: string | null; }

export interface SalesTargetRow {
  user: HRUser;
  month: number; year: number;
  targetRevenue: number | null;
  targetBookings: number | null;
  incentivePercent: number | null;
  achievedRevenue: number;
  achievedBookings: number;
  incentiveAmount: number;
}

export interface SalaryAccessGrant {
  id: string; name: string; email: string;
  access: { isActive: boolean; expiresAt: string; grantedBy: HRUser; grantedAt: string; currentlyActive: boolean } | null;
}

export interface SalaryConfigRow { user: HRUser; baseSalary: number | null; }

export interface PayoutLine { amountDue: number; amountPaid: number; status: 'PENDING' | 'PARTIAL' | 'PAID'; paidAt: string | null; }
export interface PayoutRow { user: HRUser; salary: PayoutLine | null; incentive: PayoutLine | null; }

// ── Sales Targets ───────────────────────────────────────────────────────────

export function useSalesTargets(month: number, year: number) {
  return useQuery<SalesTargetRow[]>({
    queryKey: ['hr', 'sales-targets', month, year],
    queryFn: async () => (await api.get(`/hr/sales-targets?month=${month}&year=${year}`)).data.data,
  });
}

export function useSalesTargetHistory(userId?: string) {
  return useQuery<(SalesTargetRow & { id: string })[]>({
    queryKey: ['hr', 'sales-targets', 'history', userId],
    queryFn: async () => (await api.get(`/hr/sales-targets/${userId}/history`)).data.data,
    enabled: !!userId,
  });
}

export function useSetSalesTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, ...payload }: { userId: string; month: number; year: number; targetRevenue?: number; targetBookings?: number; incentivePercent?: number }) =>
      (await api.put(`/hr/sales-targets/${userId}`, payload)).data.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr', 'sales-targets'] }); toast.success('Target saved'); },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to save target'),
  });
}

// ── Finance Salary Access ───────────────────────────────────────────────────

export function useSalaryAccessGrants() {
  return useQuery<SalaryAccessGrant[]>({
    queryKey: ['hr', 'salary-access'],
    queryFn: async () => (await api.get('/hr/salary-access')).data.data,
  });
}

export function useGrantSalaryAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, months }: { userId: string; months: number }) =>
      (await api.post(`/hr/salary-access/${userId}/grant`, { months })).data.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr', 'salary-access'] }); toast.success('Access granted'); },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to grant access'),
  });
}

export function useRevokeSalaryAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => (await api.post(`/hr/salary-access/${userId}/revoke`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr', 'salary-access'] }); toast.success('Access revoked'); },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to revoke access'),
  });
}

// ── Salary Config ────────────────────────────────────────────────────────────

export function useSalaryConfig() {
  return useQuery<SalaryConfigRow[]>({
    queryKey: ['hr', 'salary-config'],
    queryFn: async () => (await api.get('/hr/salary-config')).data.data,
  });
}

export function useSetSalaryConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, baseSalary }: { userId: string; baseSalary: number }) =>
      (await api.put(`/hr/salary-config/${userId}`, { baseSalary })).data.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr', 'salary-config'] }); qc.invalidateQueries({ queryKey: ['hr', 'payouts'] }); toast.success('Base salary updated'); },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to update salary'),
  });
}

// ── Payouts ──────────────────────────────────────────────────────────────────

export function usePayouts(month: number, year: number) {
  return useQuery<PayoutRow[]>({
    queryKey: ['hr', 'payouts', month, year],
    queryFn: async () => (await api.get(`/hr/payouts?month=${month}&year=${year}`)).data.data,
  });
}

export function useReleasePayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, type, month, year, amount }: { userId: string; type: 'SALARY' | 'INCENTIVE'; month: number; year: number; amount: number }) =>
      (await api.post(`/hr/payouts/${userId}/release`, { type, month, year, amount })).data.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr', 'payouts'] }); toast.success('Payment released'); },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to release payment'),
  });
}
