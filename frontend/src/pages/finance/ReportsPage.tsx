import { useState } from 'react';
import { Download, FileDown, FileText, Printer, FileBarChart } from 'lucide-react';
import {
  useCollectionReport, useEmployeeCollectionReport, useDestinationRevenueReport, useDepartureRevenueReport,
  useOutstandingReport, useVendorPaymentReport, useRefundReport, useExpenseReport,
  useTripProfitabilityReport, usePackageProfitabilityReport, useProfitLossReport,
} from '../../hooks/useFinance';
import { exportRowsToExcel, exportRowsToCSV, exportRowsToPDF } from '../../utils/reportExport';
import { formatCurrency } from '../../utils/helpers';

type Tab = 'collections' | 'employees' | 'destinations' | 'departures' | 'outstanding' | 'vendors' | 'refunds' | 'expenses' | 'tripProfit' | 'packageProfit' | 'pnl';

const TABS: { key: Tab; label: string }[] = [
  { key: 'collections', label: 'Collections' },
  { key: 'employees', label: 'Employee-wise' },
  { key: 'destinations', label: 'Destination Revenue' },
  { key: 'departures', label: 'Departure Revenue' },
  { key: 'outstanding', label: 'Outstanding' },
  { key: 'vendors', label: 'Vendor Payments' },
  { key: 'refunds', label: 'Refunds' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'tripProfit', label: 'Trip Profit' },
  { key: 'packageProfit', label: 'Package Profit' },
  { key: 'pnl', label: 'Profit & Loss' },
];

function ReportTable({ rows, columns }: { rows: Record<string, any>[]; columns: { key: string; label: string; format?: (v: any) => string }[] }) {
  if (rows.length === 0) return <div className="empty-state"><p className="text-sm text-slate-400">No data for this report</p></div>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 print-area">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {columns.map((c) => <th key={c.key} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">{c.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-slate-50">
              {columns.map((c) => <td key={c.key} className="px-4 py-2.5">{c.format ? c.format(r[c.key]) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FinanceReportsPage() {
  const [tab, setTab] = useState<Tab>('collections');
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const collections = useCollectionReport({ period });
  const employees = useEmployeeCollectionReport({});
  const destinations = useDestinationRevenueReport();
  const departures = useDepartureRevenueReport();
  const outstanding = useOutstandingReport();
  const vendors = useVendorPaymentReport();
  const refunds = useRefundReport();
  const expenses = useExpenseReport();
  const tripProfit = useTripProfitabilityReport();
  const packageProfit = usePackageProfitabilityReport();
  const pnl = useProfitLossReport({});

  const handlePrint = () => {
    document.body.classList.add('printing');
    window.print();
    document.body.classList.remove('printing');
  };

  const currentRows: Record<string, any>[] =
    tab === 'collections' ? (collections.data?.data?.rows ?? []) :
    tab === 'employees' ? (employees.data?.data?.rows ?? []) :
    tab === 'destinations' ? (destinations.data?.data?.rows ?? []) :
    tab === 'departures' ? (departures.data?.data?.rows ?? []) :
    tab === 'outstanding' ? (outstanding.data?.data?.rows ?? []) :
    tab === 'vendors' ? (vendors.data?.data?.rows ?? []) :
    tab === 'refunds' ? (refunds.data?.data?.rows ?? []) :
    tab === 'expenses' ? (expenses.data?.data?.rows ?? []) :
    tab === 'tripProfit' ? (tripProfit.data?.data?.rows ?? []) :
    tab === 'packageProfit' ? (packageProfit.data?.data?.rows ?? []) : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Reports</h2>
          <p className="text-sm text-slate-500 mt-0.5">Collections, revenue, outstanding, vendor, and refund reporting</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => exportRowsToCSV(`${tab}-report.csv`, currentRows)} disabled={currentRows.length === 0} className="btn-secondary text-sm"><FileDown className="w-4 h-4" />CSV</button>
          <button onClick={() => exportRowsToExcel(`${tab}-report.xlsx`, currentRows)} disabled={currentRows.length === 0} className="btn-secondary text-sm"><Download className="w-4 h-4" />Excel</button>
          <button onClick={() => exportRowsToPDF(`${tab}-report.pdf`, currentRows, TABS.find(t => t.key === tab)?.label ?? 'Finance Report')} disabled={currentRows.length === 0} className="btn-secondary text-sm"><FileText className="w-4 h-4" />PDF</button>
          <button onClick={handlePrint} className="btn-secondary text-sm"><Printer className="w-4 h-4" />Print</button>
        </div>
      </div>

      <div className="tabs overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={tab === t.key ? 'tab-item-active' : 'tab-item'}>{t.label}</button>
        ))}
      </div>

      {tab === 'collections' && (
        <>
          <div className="flex items-center gap-2">
            {(['daily', 'weekly', 'monthly'] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${period === p ? 'bg-primary-100 text-primary-700' : 'text-slate-500 hover:bg-slate-100'}`}>{p}</button>
            ))}
          </div>
          <ReportTable rows={collections.data?.data?.rows ?? []} columns={[
            { key: 'period', label: 'Period' },
            { key: 'total', label: 'Total Collected', format: formatCurrency },
            { key: 'count', label: 'Transactions' },
          ]} />
        </>
      )}

      {tab === 'employees' && (
        <ReportTable rows={employees.data?.data?.rows ?? []} columns={[
          { key: 'name', label: 'Sales Employee' },
          { key: 'total', label: 'Total Collected', format: formatCurrency },
          { key: 'count', label: 'Transactions' },
        ]} />
      )}

      {tab === 'destinations' && (
        <ReportTable rows={destinations.data?.data?.rows ?? []} columns={[
          { key: 'destination', label: 'Destination' },
          { key: 'revenue', label: 'Revenue', format: formatCurrency },
          { key: 'collected', label: 'Collected', format: formatCurrency },
          { key: 'count', label: 'Bookings' },
        ]} />
      )}

      {tab === 'departures' && (
        <ReportTable rows={departures.data?.data?.rows ?? []} columns={[
          { key: 'destination', label: 'Destination' },
          { key: 'departureDate', label: 'Departure Date' },
          { key: 'revenue', label: 'Revenue', format: formatCurrency },
          { key: 'collected', label: 'Collected', format: formatCurrency },
          { key: 'travelers', label: 'Bookings' },
        ]} />
      )}

      {tab === 'outstanding' && (
        <ReportTable rows={outstanding.data?.data?.rows ?? []} columns={[
          { key: 'customer', label: 'Customer' },
          { key: 'phone', label: 'Phone' },
          { key: 'salesEmployee', label: 'Sales Employee' },
          { key: 'totalPrice', label: 'Total', format: formatCurrency },
          { key: 'collected', label: 'Collected', format: formatCurrency },
          { key: 'pending', label: 'Pending', format: formatCurrency },
          { key: 'dueDate', label: 'Due Date' },
        ]} />
      )}

      {tab === 'vendors' && (
        <ReportTable rows={vendors.data?.data?.rows ?? []} columns={[
          { key: 'vendor', label: 'Vendor' },
          { key: 'serviceType', label: 'Service' },
          { key: 'totalAmount', label: 'Total', format: formatCurrency },
          { key: 'advancePaid', label: 'Advance Paid', format: formatCurrency },
          { key: 'balance', label: 'Balance', format: formatCurrency },
          { key: 'status', label: 'Status' },
          { key: 'dueDate', label: 'Due Date' },
        ]} />
      )}

      {tab === 'refunds' && (
        <ReportTable rows={refunds.data?.data?.rows ?? []} columns={[
          { key: 'customer', label: 'Customer' },
          { key: 'amount', label: 'Amount', format: formatCurrency },
          { key: 'reason', label: 'Reason' },
          { key: 'status', label: 'Status' },
          { key: 'refundDate', label: 'Refund Date' },
          { key: 'transactionId', label: 'Transaction ID' },
        ]} />
      )}

      {tab === 'expenses' && (
        <ReportTable rows={expenses.data?.data?.rows ?? []} columns={[
          { key: 'category', label: 'Category' },
          { key: 'amount', label: 'Amount', format: formatCurrency },
          { key: 'status', label: 'Status' },
          { key: 'trip', label: 'Trip' },
          { key: 'package', label: 'Package' },
          { key: 'vendor', label: 'Vendor' },
          { key: 'loggedBy', label: 'Logged By' },
          { key: 'date', label: 'Date' },
        ]} />
      )}

      {tab === 'tripProfit' && (
        <ReportTable rows={tripProfit.data?.data?.rows ?? []} columns={[
          { key: 'destination', label: 'Destination' },
          { key: 'departureDate', label: 'Departure Date' },
          { key: 'revenue', label: 'Revenue', format: formatCurrency },
          { key: 'collected', label: 'Collected', format: formatCurrency },
          { key: 'vendorCost', label: 'Vendor Cost', format: formatCurrency },
          { key: 'expenseCost', label: 'Expenses', format: formatCurrency },
          { key: 'refunds', label: 'Refunds', format: formatCurrency },
          { key: 'netProfit', label: 'Net Profit', format: formatCurrency },
          { key: 'marginPct', label: 'Margin %', format: (v: number) => `${v}%` },
        ]} />
      )}

      {tab === 'packageProfit' && (
        <ReportTable rows={packageProfit.data?.data?.rows ?? []} columns={[
          { key: 'name', label: 'Package' },
          { key: 'code', label: 'Code' },
          { key: 'totalBookings', label: 'Bookings' },
          { key: 'totalPassengers', label: 'Passengers' },
          { key: 'revenue', label: 'Revenue', format: formatCurrency },
          { key: 'netProfit', label: 'Net Profit', format: formatCurrency },
          { key: 'avgBookingValue', label: 'Avg Booking Value', format: formatCurrency },
          { key: 'cancellationPct', label: 'Cancellation %', format: (v: number) => `${v}%` },
        ]} />
      )}

      {tab === 'pnl' && (
        <div className="print-area grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pnl.data?.data ? (
            [
              { label: 'Total Revenue', value: pnl.data.data.totalRevenue },
              { label: 'Total Collected', value: pnl.data.data.totalCollected },
              { label: 'Vendor Costs', value: pnl.data.data.totalVendorCosts },
              { label: 'Expenses', value: pnl.data.data.totalExpenses },
              { label: 'Refunds', value: pnl.data.data.totalRefunds },
              { label: 'Net Profit', value: pnl.data.data.netProfit },
            ].map((s) => (
              <div key={s.label} className="card p-4">
                <p className="text-xs text-slate-400">{s.label}</p>
                <p className="text-xl font-bold text-slate-800 mt-1">{formatCurrency(s.value)}</p>
              </div>
            ))
          ) : (
            <div className="empty-state col-span-full"><FileBarChart className="w-10 h-10 text-slate-300 mx-auto mb-2" /></div>
          )}
        </div>
      )}
    </div>
  );
}
