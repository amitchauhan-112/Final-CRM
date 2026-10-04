import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../services/api';

export interface BookingAdjustmentInput {
  discountAmount: number;
  discountNote?: string;
  extraExpenseAmount: number;
  extraExpenseNote?: string;
}

export function useUpdateBookingAdjustments(bookingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BookingAdjustmentInput) => {
      const { data } = await api.put(`/bookings/${bookingId}/adjustments`, input);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['erp-bookings'] });
      qc.invalidateQueries({ queryKey: ['departures'] });
      qc.invalidateQueries({ queryKey: ['departure'] });
      toast.success('Discount and extra expense saved');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to save');
    },
  });
}
