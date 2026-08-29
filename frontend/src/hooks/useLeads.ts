import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import {
  Lead,
  LeadStats,
  PaginatedResponse,
  ApiResponse,
  ActivityLog,
  Journey,
} from '../types/index';
import toast from 'react-hot-toast';

export interface LeadFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  source?: string;
  campaignId?: string;
  assignedToId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function useLeads(filters: LeadFilters = {}) {
  return useQuery<PaginatedResponse<Lead>>({
    queryKey: ['leads', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== '') params.append(k, String(v));
      });
      const { data } = await api.get(`/leads?${params}`);
      return data;
    },
    // Replaces the old 'lead_updated' Socket.IO event — only polls while this
    // list is actually on screen.
    refetchInterval: 20000,
  });
}

export function useLead(id: string | null) {
  return useQuery<ApiResponse<Lead>>({
    queryKey: ['lead', id],
    queryFn: async () => {
      const { data } = await api.get(`/leads/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useLeadJourney(id: string | null) {
  return useQuery<ApiResponse<Journey>>({
    queryKey: ['lead-journey', id],
    queryFn: async () => {
      const { data } = await api.get(`/leads/${id}/journey`);
      return data;
    },
    enabled: !!id,
  });
}

export function useLeadStats() {
  return useQuery<ApiResponse<LeadStats>>({
    queryKey: ['lead-stats'],
    queryFn: async () => {
      const { data } = await api.get('/leads/stats');
      return data;
    },
    refetchInterval: 20000,
  });
}

export function useOverdueFollowUps() {
  return useQuery<PaginatedResponse<Lead>>({
    queryKey: ['leads-overdue'],
    queryFn: async () => {
      const { data } = await api.get('/leads/overdue');
      return data;
    },
    refetchInterval: 20000,
  });
}

export function useRecentActivity() {
  return useQuery<ApiResponse<ActivityLog[]>>({
    queryKey: ['leads-activity'],
    queryFn: async () => {
      const { data } = await api.get('/leads/activity');
      return data;
    },
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<Lead>) => {
      const { data } = await api.post('/leads', payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead-stats'] });
      toast.success('Lead created successfully');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to create lead');
    },
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<Lead> & { id: string }) => {
      const { data } = await api.put(`/leads/${id}`, payload);
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead', vars.id] });
      qc.invalidateQueries({ queryKey: ['lead-stats'] });
      qc.invalidateQueries({ queryKey: ['leads-overdue'] });
      toast.success('Lead updated successfully');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to update lead');
    },
  });
}

export function useTransferLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, assignedToId, reason }: { id: string; assignedToId: string; reason?: string }) => {
      const { data } = await api.post(`/leads/${id}/transfer`, { assignedToId, reason });
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead', vars.id] });
      qc.invalidateQueries({ queryKey: ['lead-stats'] });
      toast.success('Lead transferred successfully');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to transfer lead');
    },
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/leads/${id}`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead-stats'] });
      toast.success('Lead deleted successfully');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to delete lead');
    },
  });
}
