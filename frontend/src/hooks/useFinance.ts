import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import {
  ApiResponse, PaginatedResponse, FinanceDashboardStats, Payment, PendingTrackerRow,
  CustomerLedger, Refund, VendorPayment, PaymentScheduleItem, FinanceDocument, VendorLedger,
} from '../types/index';
import toast from 'react-hot-toast';

// ─── Dashboard ─────────────────────────────────────────────────────────────────

export function useFinanceDashboard() {
  return useQuery<ApiResponse<FinanceDashboardStats>>({
    queryKey: ['finance', 'dashboard'],
    queryFn: async () => (await api.get('/finance/dashboard')).data,
    staleTime: 60 * 1000,
    // Replaces the old 'finance_updated' Socket.IO event.
    refetchInterval: 20000,
  });
}

// ─── Payment verification queue ─────────────────────────────────────────────

export interface PaymentVerificationFilters {
  status?: string; search?: string; method?: string; salesEmployeeId?: string; page?: number; limit?: number;
}

export function usePaymentsForVerification(filters: PaymentVerificationFilters = {}) {
  return useQuery<PaginatedResponse<Payment>>({
    queryKey: ['finance', 'payments', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.search) params.set('search', filters.search);
      if (filters.method) params.set('method', filters.method);
      if (filters.salesEmployeeId) params.set('salesEmployeeId', filters.salesEmployeeId);
      params.set('page', String(filters.page ?? 1));
      params.set('limit', String(filters.limit ?? 20));
      const { data } = await api.get(`/finance/payments?${params.toString()}`);
      return data;
    },
    // Replaces the old 'finance_updated' Socket.IO event.
    refetchInterval: 20000,
  });
}

export function useApprovePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.put(`/finance/payments/${id}/approve`)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['erp-bookings'] });
      toast.success('Payment approved');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to approve payment'),
  });
}

export function useRejectPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => (await api.put(`/finance/payments/${id}/reject`, { reason })).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      toast.success('Payment rejected');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to reject payment'),
  });
}

export function useRequestCorrection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => (await api.put(`/finance/payments/${id}/request-correction`, { note })).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      toast.success('Correction requested');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to request correction'),
  });
}

// ─── Customer ledger ─────────────────────────────────────────────────────────

export function useCustomerLedger(bookingId: string | undefined) {
  return useQuery<ApiResponse<CustomerLedger>>({
    queryKey: ['finance', 'ledger', bookingId],
    queryFn: async () => (await api.get(`/finance/ledger/${bookingId}`)).data,
    enabled: !!bookingId,
  });
}

// ─── Payment schedule (installment plan) ─────────────────────────────────────

export function usePaymentSchedule(bookingId: string | undefined) {
  return useQuery<ApiResponse<PaymentScheduleItem[]>>({
    queryKey: ['finance', 'schedule', bookingId],
    queryFn: async () => (await api.get(`/finance/bookings/${bookingId}/schedule`)).data,
    enabled: !!bookingId,
  });
}

export function useUpdateScheduleItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string; amount?: number; dueDate?: string; label?: string }) =>
      (await api.put(`/finance/schedule/${id}`, payload)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'schedule'] });
      toast.success('Installment updated');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to update installment'),
  });
}

// ─── Finance documents (invoices/receipts/credit notes/debit notes/vouchers) ─

export function useFinanceDocuments(bookingId: string | undefined) {
  return useQuery<ApiResponse<FinanceDocument[]>>({
    queryKey: ['finance', 'documents', bookingId],
    queryFn: async () => (await api.get(`/finance/documents?bookingId=${bookingId}`)).data,
    enabled: !!bookingId,
  });
}

export function useGenerateFinanceDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { type: string; bookingId: string; amount?: number; taxAmount?: number; reason?: string }) =>
      (await api.post('/finance/documents', payload)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'documents'] });
      toast.success('Document generated');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to generate document'),
  });
}

// ─── Pending payment tracker ─────────────────────────────────────────────────

export interface PendingTrackerFilters {
  destination?: string; salesEmployeeId?: string; status?: string; search?: string;
  departureFrom?: string; departureTo?: string; page?: number; limit?: number;
}

export function usePendingTracker(filters: PendingTrackerFilters = {}) {
  return useQuery<PaginatedResponse<PendingTrackerRow>>({
    queryKey: ['finance', 'pending-tracker', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.destination) params.set('destination', filters.destination);
      if (filters.salesEmployeeId) params.set('salesEmployeeId', filters.salesEmployeeId);
      if (filters.status) params.set('status', filters.status);
      if (filters.search) params.set('search', filters.search);
      if (filters.departureFrom) params.set('departureFrom', filters.departureFrom);
      if (filters.departureTo) params.set('departureTo', filters.departureTo);
      params.set('page', String(filters.page ?? 1));
      params.set('limit', String(filters.limit ?? 20));
      const { data } = await api.get(`/finance/pending-tracker?${params.toString()}`);
      return data;
    },
  });
}

// ─── Refunds ─────────────────────────────────────────────────────────────────

export function useRefunds(status?: string) {
  return useQuery<ApiResponse<Refund[]>>({
    queryKey: ['finance', 'refunds', status],
    queryFn: async () => (await api.get(`/finance/refunds${status ? `?status=${status}` : ''}`)).data,
  });
}

export function useCreateRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { bookingId: string; amount: number; reason: string; remarks?: string }) =>
      (await api.post('/finance/refunds', payload)).data.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['finance'] }); toast.success('Refund requested'); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to request refund'),
  });
}

export function useApproveRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.put(`/finance/refunds/${id}/approve`)).data.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['finance'] }); toast.success('Refund approved'); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to approve refund'),
  });
}

export function useMarkRefundPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, transactionId }: { id: string; transactionId?: string }) =>
      (await api.put(`/finance/refunds/${id}/mark-paid`, { transactionId })).data.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['finance'] }); toast.success('Refund marked as paid'); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to mark refund paid'),
  });
}

export function useRejectRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, remarks }: { id: string; remarks?: string }) => (await api.put(`/finance/refunds/${id}/reject`, { remarks })).data.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['finance'] }); toast.success('Refund rejected'); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to reject refund'),
  });
}

// ─── Vendor master list (read-only, owned by Operations) ────────────────────

export function useFinanceVendors() {
  return useQuery<ApiResponse<Array<{ id: string; name: string; type: string; status: string }>>>({
    queryKey: ['finance', 'vendors'],
    queryFn: async () => (await api.get('/finance/vendors')).data,
  });
}

// ─── Vendor ledger ───────────────────────────────────────────────────────────

export function useVendorLedger(vendorId: string | undefined) {
  return useQuery<ApiResponse<VendorLedger>>({
    queryKey: ['finance', 'vendor-ledger', vendorId],
    queryFn: async () => (await api.get(`/finance/vendors/${vendorId}/ledger`)).data,
    enabled: !!vendorId,
  });
}

// ─── Vendor payments ─────────────────────────────────────────────────────────

export function useVendorPayments(filters: { status?: string; vendorId?: string; serviceType?: string } = {}) {
  return useQuery<ApiResponse<VendorPayment[]>>({
    queryKey: ['finance', 'vendor-payments', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.vendorId) params.set('vendorId', filters.vendorId);
      if (filters.serviceType) params.set('serviceType', filters.serviceType);
      const { data } = await api.get(`/finance/vendor-payments?${params.toString()}`);
      return data;
    },
  });
}

export function useCreateVendorPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<VendorPayment> & { vendorId: string; totalAmount: number }) =>
      (await api.post('/finance/vendor-payments', payload)).data.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['finance', 'vendor-payments'] }); qc.invalidateQueries({ queryKey: ['finance', 'dashboard'] }); toast.success('Vendor bill created'); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to create vendor bill'),
  });
}

export function useUpdateVendorPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<VendorPayment> & { id: string }) => (await api.put(`/finance/vendor-payments/${id}`, payload)).data.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['finance', 'vendor-payments'] }); qc.invalidateQueries({ queryKey: ['finance', 'dashboard'] }); toast.success('Vendor bill updated'); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to update vendor bill'),
  });
}

export function useDeleteVendorPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/finance/vendor-payments/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['finance', 'vendor-payments'] }); toast.success('Vendor bill removed'); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to remove vendor bill'),
  });
}

export function useUploadVendorPaymentFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file, fileType }: { id: string; file: File; fileType: 'invoice' | 'proof' }) => {
      const form = new FormData();
      form.append('file', file);
      form.append('fileType', fileType);
      const { data } = await api.post(`/finance/vendor-payments/${id}/upload`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      return data.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['finance', 'vendor-payments'] }); toast.success('File uploaded'); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Upload failed'),
  });
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export function useCollectionReport(params: { period?: string; startDate?: string; endDate?: string }) {
  return useQuery({
    queryKey: ['finance', 'reports', 'collections', params],
    queryFn: async () => {
      const qs = new URLSearchParams(params as Record<string, string>).toString();
      return (await api.get(`/finance/reports/collections?${qs}`)).data;
    },
  });
}

export function useEmployeeCollectionReport(params: { startDate?: string; endDate?: string }) {
  return useQuery({
    queryKey: ['finance', 'reports', 'employee-collections', params],
    queryFn: async () => (await api.get(`/finance/reports/employee-collections?${new URLSearchParams(params as Record<string, string>).toString()}`)).data,
  });
}

export function useDestinationRevenueReport() {
  return useQuery({
    queryKey: ['finance', 'reports', 'destination-revenue'],
    queryFn: async () => (await api.get('/finance/reports/destination-revenue')).data,
  });
}

export function useDepartureRevenueReport() {
  return useQuery({
    queryKey: ['finance', 'reports', 'departure-revenue'],
    queryFn: async () => (await api.get('/finance/reports/departure-revenue')).data,
  });
}

export function useOutstandingReport() {
  return useQuery({
    queryKey: ['finance', 'reports', 'outstanding'],
    queryFn: async () => (await api.get('/finance/reports/outstanding')).data,
  });
}

export function useVendorPaymentReport() {
  return useQuery({
    queryKey: ['finance', 'reports', 'vendor-payments'],
    queryFn: async () => (await api.get('/finance/reports/vendor-payments')).data,
  });
}

export function useRefundReport() {
  return useQuery({
    queryKey: ['finance', 'reports', 'refunds'],
    queryFn: async () => (await api.get('/finance/reports/refunds')).data,
  });
}

export function useExpenseReport() {
  return useQuery({
    queryKey: ['finance', 'reports', 'expenses'],
    queryFn: async () => (await api.get('/finance/reports/expenses')).data,
  });
}

export function useTripProfitabilityReport() {
  return useQuery({
    queryKey: ['finance', 'reports', 'trip-profitability'],
    queryFn: async () => (await api.get('/finance/reports/trip-profitability')).data,
  });
}

export function usePackageProfitabilityReport() {
  return useQuery({
    queryKey: ['finance', 'reports', 'package-profitability'],
    queryFn: async () => (await api.get('/finance/reports/package-profitability')).data,
  });
}

export function useProfitLossReport(params: { startDate?: string; endDate?: string }) {
  return useQuery({
    queryKey: ['finance', 'reports', 'profit-loss', params],
    queryFn: async () => (await api.get(`/finance/reports/profit-loss?${new URLSearchParams(params as Record<string, string>).toString()}`)).data,
  });
}
