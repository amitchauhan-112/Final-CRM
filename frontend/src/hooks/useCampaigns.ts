import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import {
  Campaign,
  CampaignStat,
  PaginatedResponse,
  ApiResponse,
} from '../types/index';
import toast from 'react-hot-toast';

export interface CampaignFilters {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}

export function useCampaigns(filters: CampaignFilters = {}) {
  return useQuery<PaginatedResponse<Campaign>>({
    queryKey: ['campaigns', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== '') params.append(k, String(v));
      });
      const { data } = await api.get(`/campaigns?${params}`);
      return data;
    },
  });
}

export function useCampaign(id: string | null) {
  return useQuery<ApiResponse<Campaign>>({
    queryKey: ['campaign', id],
    queryFn: async () => {
      const { data } = await api.get(`/campaigns/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useCampaignStats() {
  return useQuery<ApiResponse<CampaignStat[]>>({
    queryKey: ['campaign-stats'],
    queryFn: async () => {
      const { data } = await api.get('/campaigns/stats');
      return data;
    },
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<Campaign> & { employeeIds?: string[] }) => {
      const { data } = await api.post('/campaigns', payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['campaign-stats'] });
      toast.success('Campaign created successfully');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to create campaign');
    },
  });
}

export function useUpdateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: Partial<Campaign> & { id: string; employeeIds?: string[] }) => {
      const { data } = await api.put(`/campaigns/${id}`, payload);
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['campaign', vars.id] });
      qc.invalidateQueries({ queryKey: ['campaign-stats'] });
      toast.success('Campaign updated successfully');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to update campaign');
    },
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/campaigns/${id}`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['campaign-stats'] });
      toast.success('Campaign deleted successfully');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to delete campaign');
    },
  });
}
