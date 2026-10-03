import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import {
  ApiResponse, PackageAnalytics, DestinationAnalytics, CampaignAnalytics, CampaignMonitoringRow, CustomerAnalytics, EmployeeAnalytics,
} from '../types/index';
import { DateRange } from '../utils/dateRange';

export function usePackageAnalytics() {
  return useQuery<ApiResponse<PackageAnalytics[]>>({
    queryKey: ['analytics', 'packages'],
    queryFn: async () => (await api.get('/analytics/packages')).data,
  });
}

export function useDestinationAnalytics() {
  return useQuery<ApiResponse<DestinationAnalytics[]>>({
    queryKey: ['analytics', 'destinations'],
    queryFn: async () => (await api.get('/analytics/destinations')).data,
  });
}

export function useCampaignAnalytics() {
  return useQuery<ApiResponse<CampaignAnalytics[]>>({
    queryKey: ['analytics', 'campaigns'],
    queryFn: async () => (await api.get('/analytics/campaigns')).data,
  });
}

export function useCampaignMonitoring(range: DateRange) {
  return useQuery<ApiResponse<CampaignMonitoringRow[]>>({
    queryKey: ['analytics', 'campaigns', 'monitoring', range.from, range.to],
    queryFn: async () => (await api.get('/analytics/campaigns/monitoring', { params: range })).data,
  });
}

export function useCustomerAnalytics() {
  return useQuery<ApiResponse<CustomerAnalytics>>({
    queryKey: ['analytics', 'customers'],
    queryFn: async () => (await api.get('/analytics/customers')).data,
  });
}

export function useEmployeeAnalytics() {
  return useQuery<ApiResponse<EmployeeAnalytics[]>>({
    queryKey: ['analytics', 'employees'],
    queryFn: async () => (await api.get('/analytics/employees')).data,
  });
}
