import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

export interface WhatsAppAccountStatus {
  id: string;
  userId: string;
  phoneNumberId: string;
  wabaId: string;
  displayPhoneNumber: string;
  tokenLastFour: string;
  isActive: boolean;
  lastError: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

export interface WhatsAppAccountInput {
  userId: string;
  phoneNumberId: string;
  wabaId: string;
  displayPhoneNumber: string;
  accessToken: string;
}

const QK = ['whatsapp-accounts'] as const;

export function useWhatsAppAccounts() {
  return useQuery<WhatsAppAccountStatus[]>({
    queryKey: QK,
    queryFn: () => api.get('/whatsapp-accounts').then((r) => r.data.data),
    staleTime: 30_000,
  });
}

export function useSaveWhatsAppAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: WhatsAppAccountInput) =>
      api.post('/whatsapp-accounts', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useDeactivateWhatsAppAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.delete(`/whatsapp-accounts/${userId}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}
