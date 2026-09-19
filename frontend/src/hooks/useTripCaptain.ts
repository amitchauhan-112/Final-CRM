import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { ApiResponse, TripCaptainDepartureListItem, TripCaptainDepartureDetail, MealType } from '../types/index';
import toast from 'react-hot-toast';

export function useMyTripCaptainDepartures() {
  return useQuery<ApiResponse<TripCaptainDepartureListItem[]>>({
    queryKey: ['trip-captain', 'departures'],
    queryFn: async () => (await api.get('/trip-captain/departures')).data,
  });
}

export function useTripCaptainDepartureDetail(id: string | undefined) {
  return useQuery<ApiResponse<TripCaptainDepartureDetail>>({
    queryKey: ['trip-captain', 'departure', id],
    queryFn: async () => (await api.get(`/trip-captain/departures/${id}`)).data,
    enabled: !!id,
    // Ops or the captain themself could update hotel/vehicle details mid-trip
    // — keep this reasonably fresh without a full real-time layer.
    refetchInterval: 15000,
  });
}

export function useCheckInHotel(departureId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (hotelId: string) => (await api.put(`/trip-captain/hotels/${hotelId}/checkin`)).data.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['trip-captain', 'departure', departureId] }); toast.success('Checked in'); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to check in'),
  });
}

export function useCheckOutHotel(departureId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (hotelId: string) => (await api.put(`/trip-captain/hotels/${hotelId}/checkout`)).data.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['trip-captain', 'departure', departureId] }); toast.success('Checked out'); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to check out'),
  });
}

export function usePostMealUpdate(departureId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { mealType: MealType; forDate: string; menu: string }) =>
      (await api.post(`/trip-captain/departures/${departureId}/meals`, payload)).data.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['trip-captain', 'departure', departureId] }); toast.success('Menu update posted'); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to post update'),
  });
}
