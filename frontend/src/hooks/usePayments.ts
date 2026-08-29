import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { Payment, ApiResponse } from '../types/index';
import toast from 'react-hot-toast';

export function useBookingPayments(bookingId: string | null) {
  return useQuery<ApiResponse<Payment[]>>({
    queryKey: ['payments', bookingId],
    queryFn: async () => {
      const { data } = await api.get(`/bookings/${bookingId}/payments`);
      return data;
    },
    enabled: !!bookingId,
  });
}

export function usePaymentsSummary() {
  return useQuery({
    queryKey: ['payments-summary'],
    queryFn: async () => {
      const { data } = await api.get('/payments/summary');
      return data;
    },
    // Replaces the old 'finance_updated' Socket.IO event.
    refetchInterval: 20000,
  });
}

interface RecordPaymentPayload {
  bookingId: string;
  amount: number;
  type: string;
  method: string;
  reference?: string;
  notes?: string;
  receiptNo?: string;
  scheduleItemId?: string;
  proof?: File;
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, proof, ...payload }: RecordPaymentPayload) => {
      const form = new FormData();
      Object.entries(payload).forEach(([k, v]) => { if (v !== undefined && v !== '') form.append(k, String(v)); });
      if (proof) form.append('proof', proof);
      const { data } = await api.post(`/bookings/${bookingId}/payments`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['payments', vars.bookingId] });
      qc.invalidateQueries({ queryKey: ['booking'] });
      qc.invalidateQueries({ queryKey: ['payments-summary'] });
      toast.success('Payment submitted for verification');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to record payment'),
  });
}

export function useDeletePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, id }: { bookingId: string; id: string }) => {
      const { data } = await api.delete(`/bookings/${bookingId}/payments/${id}`);
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['payments', vars.bookingId] });
      qc.invalidateQueries({ queryKey: ['booking'] });
      qc.invalidateQueries({ queryKey: ['payments-summary'] });
      toast.success('Payment deleted');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to delete payment'),
  });
}
