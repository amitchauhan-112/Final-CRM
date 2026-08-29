import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

export interface MetaConnectionStatus {
  id: string;
  adAccountId: string;
  pageId: string | null;
  tokenLastFour: string;
  isActive: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  lastLeadBackfillAt: string | null;
  lastLeadBackfillResult: string | null;
}

export interface LeadBackfillResult {
  formsScanned: number;
  leadsFound: number;
  leadsCreated: number;
  duplicatesSkipped: number;
  errors: string[];
}

export interface MetaConnectionInput {
  adAccountId: string;
  pageId?: string;
  systemUserToken: string;
}

export interface ArchivedCampaign {
  id: string;
  name: string;
  destination: string;
  metaCampaignId: string | null;
  archivedAt: string;
  archiveS3Key: string | null;
  createdAt: string;
  _count: { leads: number };
}

const QK = ['meta-connection'] as const;

export function useMetaConnection() {
  return useQuery<MetaConnectionStatus | null>({
    queryKey: QK,
    queryFn: () => api.get('/settings/meta-connection').then((r) => r.data.data),
    staleTime: 30_000,
  });
}

export function useSaveMetaConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: MetaConnectionInput) =>
      api.post('/settings/meta-connection', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useDeleteMetaConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete('/settings/meta-connection').then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useTriggerMetaSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/settings/meta-connection/sync').then((r) => r.data),
    onSuccess: () => {
      // Re-fetch connection status after a short delay so lastSyncAt updates
      setTimeout(() => qc.invalidateQueries({ queryKey: QK }), 3000);
      qc.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

export function useTriggerLeadBackfill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/settings/meta-connection/backfill-leads').then((r) => r.data),
    onSuccess: () => {
      // Backfill runs in the background — poll connection status (which
      // carries the result) a few times over the next stretch.
      [15_000, 30_000, 60_000, 120_000].forEach((delay) =>
        setTimeout(() => qc.invalidateQueries({ queryKey: QK }), delay)
      );
      setTimeout(() => qc.invalidateQueries({ queryKey: ['leads'] }), 30_000);
    },
  });
}

export function useArchivedCampaigns() {
  return useQuery<ArchivedCampaign[]>({
    queryKey: ['campaigns', 'archived'],
    queryFn: () => api.get('/campaigns/archived').then((r) => r.data.data),
    staleTime: 60_000,
  });
}

export function useArchiveDownload() {
  return useMutation({
    mutationFn: (campaignId: string) =>
      api.get(`/campaigns/${campaignId}/archive-download`).then((r) => r.data.data as { url: string }),
  });
}
