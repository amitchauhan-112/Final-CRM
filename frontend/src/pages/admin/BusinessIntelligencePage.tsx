import {
  usePackageAnalytics, useDestinationAnalytics, useCampaignAnalytics, useCustomerAnalytics, useEmployeeAnalytics,
} from '../../hooks/useAnalytics';
import Tabs, { useUrlTab } from '../../components/ui/Tabs';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatCurrency, leadStatusConfig, cn } from '../../utils/helpers';
import { LeadStatus } from '../../types/index';

const TABS = [
  { key: 'packages', label: 'Package Analytics' },
  { key: 'destinations', label: 'Destination Analytics' },
  { key: 'campaigns', label: 'Campaign Analytics' },
  { key: 'customers', label: 'Customer Analytics' },
  { key: 'employees', label: 'Employee Analytics' },
] as const;
type Tab = typeof TABS[number]['key'];

function DataTable({ rows, columns }: { rows: Record<string, any>[]; columns: { key: string; label: string; format?: (v: any) => React.ReactNode }[] }) {
  if (rows.length === 0) return <div className="empty-state"><p className="text-sm text-slate-400">No data yet</p></div>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {columns.map((c) => <th key={c.key} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">{c.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-slate-50">
              {columns.map((c) => <td key={c.key} className="px-4 py-2.5 whitespace-nowrap">{c.format ? c.format(r[c.key]) : (r[c.key] ?? '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const pct = (v: number | null) => v === null ? '—' : `${v}%`;
const hrs = (v: number | null) => v === null ? '—' : `${v}h`;
const list = (v: string[]) => v.length ? v.join(', ') : '—';

// Only shows statuses the employee actually has leads in — a full 7-badge
// row for every employee would be mostly zeros and hard to scan.
const statusBreakdown = (byStatus: Record<LeadStatus, number>) => {
  const entries = Object.entries(byStatus).filter(([, count]) => count > 0);
  if (entries.length === 0) return '—';
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([status, count]) => {
        const cfg = leadStatusConfig[status as LeadStatus];
        return (
          <span key={status} className={cn('text-[11px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap', cfg?.bg, cfg?.color)}>
            {cfg?.label ?? status} {count}
          </span>
        );
      })}
    </div>
  );
};

export default function BusinessIntelligencePage() {
  const [tab, setTab] = useUrlTab(TABS, 'packages');

  const packages = usePackageAnalytics();
  const destinations = useDestinationAnalytics();
  const campaigns = useCampaignAnalytics();
  const customers = useCustomerAnalytics();
  const employees = useEmployeeAnalytics();

  const activeQuery = { packages, destinations, campaigns, customers, employees }[tab];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Business Intelligence</h2>
        <p className="text-sm text-slate-500 mt-0.5">Live analytics across packages, destinations, campaigns, customers, and employees</p>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {activeQuery.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (
        <>
          {tab === 'packages' && (
            <DataTable rows={packages.data?.data ?? []} columns={[
              { key: 'name', label: 'Package' },
              { key: 'bookings', label: 'Bookings' },
              { key: 'passengers', label: 'Passengers' },
              { key: 'revenue', label: 'Revenue', format: formatCurrency },
              { key: 'expenses', label: 'Expenses', format: formatCurrency },
              { key: 'profit', label: 'Profit', format: formatCurrency },
              { key: 'cancellationPct', label: 'Cancellation %', format: (v) => `${v}%` },
              { key: 'upcomingTrips', label: 'Upcoming Trips' },
              { key: 'mostPopularMonth', label: 'Most Popular Month' },
            ]} />
          )}

          {tab === 'destinations' && (
            <DataTable rows={destinations.data?.data ?? []} columns={[
              { key: 'destination', label: 'Destination' },
              { key: 'revenue', label: 'Revenue', format: formatCurrency },
              { key: 'profit', label: 'Profit', format: formatCurrency },
              { key: 'trips', label: 'Trips' },
              { key: 'passengers', label: 'Passengers' },
              { key: 'growthPct', label: 'Growth', format: pct },
              { key: 'refundPct', label: 'Refund %', format: (v) => `${v}%` },
              { key: 'topPackages', label: 'Top Packages', format: list },
            ]} />
          )}

          {tab === 'campaigns' && (
            <DataTable rows={campaigns.data?.data ?? []} columns={[
              { key: 'name', label: 'Campaign' },
              { key: 'leadsGenerated', label: 'Leads' },
              { key: 'bookings', label: 'Bookings' },
              { key: 'revenue', label: 'Revenue', format: formatCurrency },
              { key: 'expenses', label: 'Expenses (Budget)', format: formatCurrency },
              { key: 'roi', label: 'ROI', format: pct },
              { key: 'costPerLead', label: 'Cost / Lead', format: (v) => v === null ? '—' : formatCurrency(v) },
              { key: 'costPerBooking', label: 'Cost / Booking', format: (v) => v === null ? '—' : formatCurrency(v) },
              { key: 'conversionRatePct', label: 'Conversion %', format: (v) => `${v}%` },
              { key: 'bestPerformingMonth', label: 'Best Month' },
            ]} />
          )}

          {tab === 'customers' && customers.data?.data && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Total Customers', value: customers.data.data.summary.totalCustomers },
                  { label: 'Returning Customers', value: customers.data.data.summary.returningCustomers },
                  { label: 'Average Spending', value: formatCurrency(customers.data.data.summary.averageSpending) },
                  { label: 'Total Referrals', value: customers.data.data.summary.totalReferrals },
                ].map((c) => (
                  <div key={c.label} className="card p-4">
                    <p className="text-xs text-slate-400">{c.label}</p>
                    <p className="text-lg font-bold text-slate-800 mt-1">{c.value}</p>
                  </div>
                ))}
              </div>
              <DataTable rows={customers.data.data.customers} columns={[
                { key: 'name', label: 'Customer' },
                { key: 'phone', label: 'Phone' },
                { key: 'lifetimeValue', label: 'Lifetime Value', format: formatCurrency },
                { key: 'tripsCompleted', label: 'Completed' },
                { key: 'tripsUpcoming', label: 'Upcoming' },
                { key: 'tripsCancelled', label: 'Cancelled' },
                { key: 'preferredDestination', label: 'Preferred Destination' },
                { key: 'preferredPackage', label: 'Preferred Package' },
                { key: 'referralCount', label: 'Referrals' },
                { key: 'isReturning', label: 'Returning', format: (v) => v ? 'Yes' : 'No' },
              ]} />
            </div>
          )}

          {tab === 'employees' && (
            <DataTable rows={employees.data?.data ?? []} columns={[
              { key: 'name', label: 'Employee' },
              { key: 'byStatus', label: 'Lead Status Breakdown', format: statusBreakdown },
              { key: 'assignedLeads', label: 'Assigned Leads' },
              { key: 'activeLeads', label: 'Active Leads' },
              { key: 'bookings', label: 'Bookings' },
              { key: 'revenueGenerated', label: 'Revenue Generated', format: formatCurrency },
              { key: 'conversionRatePct', label: 'Conversion %', format: (v) => `${v}%` },
              { key: 'avgResponseTimeHours', label: 'Avg Response Time', format: hrs },
              { key: 'pendingFollowUps', label: 'Pending Follow-ups' },
              { key: 'completedFollowUps', label: 'Completed Follow-ups' },
              { key: 'avgFollowUpDelayHours', label: 'Avg Follow-up Delay', format: hrs },
              { key: 'taskCompletionRatePct', label: 'Task Completion %', format: pct },
            ]} />
          )}
        </>
      )}
    </div>
  );
}
