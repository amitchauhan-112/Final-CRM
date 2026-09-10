import { downloadSheetFromEndpoint, todayStamp } from './reportExport';

export const exportLeadsToExcel = (query = '') =>
  downloadSheetFromEndpoint(`/leads/export${query}`, `leads_${todayStamp()}.xlsx`);

export const exportUsersToExcel = () =>
  downloadSheetFromEndpoint('/users/export', `employees_${todayStamp()}.xlsx`);

export const exportCampaignsToExcel = () =>
  downloadSheetFromEndpoint('/campaigns/export', `campaigns_${todayStamp()}.xlsx`);

export const exportDeletedLeadsToExcel = () =>
  downloadSheetFromEndpoint('/leads/deleted/export', `deleted_leads_${todayStamp()}.xlsx`);
