import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { Booking, ApiResponse, FinanceDocument } from '../types/index';
import toast from 'react-hot-toast';

export function useBookingByLead(leadId: string | null) {
  return useQuery<ApiResponse<Booking>>({
    queryKey: ['booking', leadId],
    queryFn: async () => {
      const { data } = await api.get(`/bookings/lead/${leadId}`);
      return data;
    },
    enabled: !!leadId,
    retry: false,
    // Replaces the old 'finance_updated' Socket.IO event.
    refetchInterval: 20000,
  });
}

export function useBookingDocuments(bookingId: string | undefined) {
  return useQuery<ApiResponse<FinanceDocument[]>>({
    queryKey: ['booking', bookingId, 'documents'],
    queryFn: async () => (await api.get(`/bookings/${bookingId}/documents`)).data,
    enabled: !!bookingId,
  });
}

type BookingPayload = {
  leadId: string;
  travelerName: string;
  numberOfTravelers: number;
  aadharNumber?: string;
  foodPreference: string;
  roomSharing: string;
  // Group bookings only, at creation time — breaks the headcount into
  // per-room-type sub-groups (e.g. 2 Double + 3 Triple) instead of one
  // uniform room type for the whole party.
  roomSplit?: { count: number; roomSharing: string }[];
  departureLocation?: string;
  departurePackage?: string;
  tourType: string;
  specialRequest?: string;
  bookingNotes?: string;
  packageId?: string;
  departureDate?: string;
  returnDate?: string;
  finalPrice: number;
  amountPaid: number;
  balanceDueDate?: string;
};

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: BookingPayload) => {
      const { data } = await api.post('/bookings', payload);
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['booking', vars.leadId] });
      qc.invalidateQueries({ queryKey: ['lead', vars.leadId] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      // The Bookings list (Admin + employee My Bookings) sorts by last
      // activity — without this it can keep showing a stale, pre-booking
      // snapshot for up to the query's staleTime instead of putting the
      // just-confirmed booking straight at the top.
      qc.invalidateQueries({ queryKey: ['erp-bookings'] });
      toast.success('Booking confirmed!');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to confirm booking'),
  });
}

export function useUpdateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, leadId, ...payload }: Partial<Booking> & { id: string; leadId: string }) => {
      const { data } = await api.put(`/bookings/${id}`, payload);
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['booking', vars.leadId] });
      qc.invalidateQueries({ queryKey: ['erp-bookings'] });
      toast.success('Booking updated');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to update booking'),
  });
}

export function useMarkReviewCollected(leadId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string) => (await api.put(`/bookings/${bookingId}/mark-review-collected`)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['booking', leadId] });
      qc.invalidateQueries({ queryKey: ['lead-journey', leadId] });
      toast.success('Review marked as collected');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to update'),
  });
}

export function useMarkReferralReceived(leadId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string) => (await api.put(`/bookings/${bookingId}/mark-referral-received`)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['booking', leadId] });
      qc.invalidateQueries({ queryKey: ['lead-journey', leadId] });
      toast.success('Referral marked as received');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to update'),
  });
}
