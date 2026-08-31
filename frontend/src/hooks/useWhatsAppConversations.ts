import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

export interface WhatsAppConversationSummary {
  id: string;
  customerPhone: string;
  leadId: string | null;
  lead: { id: string; name: string } | null;
  account: { displayPhoneNumber: string; user: { id: string; name: string } };
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
}

export interface WhatsAppMessage {
  id: string;
  conversationId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  body: string | null;
  type: string;
  status: 'RECEIVED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  errorMessage: string | null;
  isEcho: boolean;
  sentById: string | null;
  timestamp: string;
}

export function useWhatsAppConversations() {
  return useQuery<WhatsAppConversationSummary[]>({
    queryKey: ['whatsapp-conversations'],
    queryFn: () => api.get('/whatsapp/conversations').then((r) => r.data.data),
    // Replaces a WebSocket-driven inbox refresh — only polls while the inbox
    // is actually on screen, matching the rest of this app's post-Socket.IO
    // convention (see useLeads.ts).
    refetchInterval: 20000,
  });
}

export function useWhatsAppMessages(conversationId: string | null) {
  return useQuery<WhatsAppMessage[]>({
    queryKey: ['whatsapp-messages', conversationId],
    queryFn: () => api.get(`/whatsapp/conversations/${conversationId}/messages`).then((r) => r.data.data),
    enabled: !!conversationId,
    // Shorter interval than the conversation list — this is the "live chat"
    // screen, only active while one specific thread is open.
    refetchInterval: 8000,
  });
}

export function useSendWhatsAppMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api.post(`/whatsapp/conversations/${conversationId}/messages`, { body }).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-messages', conversationId] });
      qc.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
    },
  });
}
