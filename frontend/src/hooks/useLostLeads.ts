import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../services/api';
import type { Lead } from '../types/index';
import type { LostBucket } from '../utils/lostReasons';

export interface LostLeadRow extends Lead {
  lostBucket: LostBucket;
}

export interface LostLeadFilters {
  bucket: LostBucket;
  // Postponed only: "DUE" for months that have arrived, or "YYYY-MM".
  month?: string;
  search?: string;
}

export interface LostLeadMeta {
  total: number;
  truncated: boolean;
  counts: Record<LostBucket, number>;
  postponedByMonth: Record<string, number>;
  currentMonth: string;
}

function toParams(filters: LostLeadFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== '') params.append(k, String(v));
  });
  return params.toString();
}

export function useLostLeads(filters: LostLeadFilters) {
  return useQuery<{ success: boolean; data: LostLeadRow[]; meta: LostLeadMeta }>({
    queryKey: ['lost-leads', filters],
    queryFn: async () => {
      const { data } = await api.get(`/leads/lost?${toParams(filters)}`);
      return data;
    },
  });
}

// Rows for the Excel/CSV download — same filters as the list, so the file matches the screen.
export async function fetchLostLeadExportRows(filters: LostLeadFilters): Promise<Record<string, unknown>[]> {
  const { data } = await api.get(`/leads/lost/export?${toParams(filters)}`);
  return data.data;
}

export interface ReviveInput {
  leadIds: string[];
  comment: string;
  assignedToId?: string;
}

export function useReviveLostLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReviveInput) => {
      const { data } = await api.post('/leads/lost/revive', input);
      return data as { success: boolean; data: { revived: number; skipped: number } };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['lost-leads'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead-stats'] });
      const { revived, skipped } = res.data;
      toast.success(
        skipped > 0
          ? `${revived} lead${revived === 1 ? '' : 's'} revived · ${skipped} skipped (no longer lost)`
          : `${revived} lead${revived === 1 ? '' : 's'} revived`
      );
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to revive leads');
    },
  });
}
