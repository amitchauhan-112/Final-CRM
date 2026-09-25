import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { ApiResponse, ApprovalRequest } from '../types/index';
import toast from 'react-hot-toast';

// Admin's oversight queue (every pending request), or — for anyone else —
// just the requests specifically assigned to them (e.g. a Sales person's
// pending payment corrections).
export function usePendingApprovals() {
  return useQuery<ApiResponse<ApprovalRequest[]>>({
    queryKey: ['approvals', 'pending'],
    queryFn: async () => (await api.get('/approvals')).data,
    refetchInterval: 30000,
  });
}

// Requests I submitted, any status — for "my change is pending approval" UI.
export function useMyApprovalRequests() {
  return useQuery<ApiResponse<ApprovalRequest[]>>({
    queryKey: ['approvals', 'mine'],
    queryFn: async () => (await api.get('/approvals/mine')).data,
    refetchInterval: 30000,
  });
}

function invalidateApprovals(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['approvals'] });
  qc.invalidateQueries({ queryKey: ['bookings'] });
  qc.invalidateQueries({ queryKey: ['finance'] });
  qc.invalidateQueries({ queryKey: ['leads'] });
}

export function useApproveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.put(`/approvals/${id}/approve`)).data.data,
    onSuccess: () => { invalidateApprovals(qc); toast.success('Approved'); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to approve'),
  });
}

export function useRejectRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reviewNote }: { id: string; reviewNote?: string }) =>
      (await api.put(`/approvals/${id}/reject`, { reviewNote })).data.data,
    onSuccess: () => { invalidateApprovals(qc); toast.success('Rejected'); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to reject'),
  });
}

export function useCancelRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/approvals/${id}`)).data,
    onSuccess: () => { invalidateApprovals(qc); toast.success('Request cancelled'); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to cancel'),
  });
}
