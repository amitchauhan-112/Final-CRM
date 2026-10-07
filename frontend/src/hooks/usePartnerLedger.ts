import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../services/api';

export interface PartnerLedgerRow {
  id: string;
  name: string;
  isLinkedToLogin: boolean;
  paid: number;
  collected: number;
  net: number;
}
export interface Settlement { fromId: string; fromName: string; toId: string; toName: string; amount: number }
export interface PartnerLedgerData { partners: PartnerLedgerRow[]; fairShare: number; settlements: Settlement[] }

export function usePartnerLedger() {
  return useQuery<{ success: boolean; data: PartnerLedgerData }>({
    queryKey: ['partner-ledger'],
    queryFn: async () => (await api.get('/partner-ledger')).data,
  });
}

// Who "Handover To" can pick — just the partners, not every employee.
export function usePartnerHandoverOptions() {
  return useQuery<{ success: boolean; data: { id: string; name: string }[] }>({
    queryKey: ['partner-ledger', 'handover-options'],
    queryFn: async () => (await api.get('/partner-ledger/handover-options')).data,
  });
}

// Null if the current user isn't linked to a partner profile.
export function useMyPartner() {
  return useQuery<{ success: boolean; data: { id: string; name: string } | null }>({
    queryKey: ['partner-ledger', 'mine'],
    queryFn: async () => (await api.get('/partner-ledger/mine')).data,
  });
}

export interface PartnerCollection {
  id: string;
  partnerId: string;
  partner: { id: string; name: string };
  amount: number;
  description: string | null;
  collectedAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdBy: { id: string; name: string };
  approvedBy: { id: string; name: string } | null;
  rejectionReason: string | null;
}

export function usePartnerCollections(partnerId?: string) {
  return useQuery<{ success: boolean; data: PartnerCollection[] }>({
    queryKey: ['partner-collections', partnerId],
    queryFn: async () => (await api.get(`/partner-ledger/collections${partnerId ? `?partnerId=${partnerId}` : ''}`)).data,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['partner-ledger'] });
  qc.invalidateQueries({ queryKey: ['partner-collections'] });
}

export function useCreatePartnerCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { partnerId: string; amount: number; description?: string; collectedAt?: string }) =>
      (await api.post('/partner-ledger/collections', input)).data.data,
    onSuccess: () => { invalidate(qc); toast.success('Collection logged — waiting on Admin approval'); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to log collection'),
  });
}

export function useApprovePartnerCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.put(`/partner-ledger/collections/${id}/approve`)).data.data,
    onSuccess: () => { invalidate(qc); toast.success('Approved'); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to approve'),
  });
}

export function useRejectPartnerCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      (await api.put(`/partner-ledger/collections/${id}/reject`, { reason })).data.data,
    onSuccess: () => { invalidate(qc); toast.success('Rejected'); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to reject'),
  });
}
