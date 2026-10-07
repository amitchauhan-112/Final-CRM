import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../services/api';

export interface ExpenseClaim {
  id: string;
  category: string;
  amount: number;
  description: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  billUrl: string | null;
  rejectionReason: string | null;
  paidByPartner: { id: string; name: string } | null;
  approvedBy: { id: string; name: string } | null;
  createdAt: string;
}

export function useMyExpenseClaims() {
  return useQuery<{ success: boolean; data: ExpenseClaim[] }>({
    queryKey: ['expense-claims', 'mine'],
    queryFn: async () => (await api.get('/expense-claims/mine')).data,
  });
}

export function useCreateExpenseClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { category: string; amount: number; description?: string; paidByPartnerId?: string; bill?: File }) => {
      const form = new FormData();
      form.append('category', input.category);
      form.append('amount', String(input.amount));
      if (input.description) form.append('description', input.description);
      if (input.paidByPartnerId) form.append('paidByPartnerId', input.paidByPartnerId);
      if (input.bill) form.append('bill', input.bill);
      return (await api.post('/expense-claims', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-claims'] });
      toast.success('Claim submitted — waiting on Admin approval');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to submit claim'),
  });
}
