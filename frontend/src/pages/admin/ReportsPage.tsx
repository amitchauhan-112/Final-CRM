import { useState, useMemo } from 'react';
import {
  BarChart2, Download, FileDown, FileText, TrendingUp, Users, CheckCircle,
  XCircle, Loader2, Megaphone, AlertTriangle,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import {
  useLeadReport,
  usePerformanceReport,
  useLostReasonReport,
  useCampaignReport,
  useDailyTrend,
} from '../../hooks/useReports';
import { exportRowsToExcel, exportRowsToCSV, exportRowsToPDF } from '../../utils/reportExport';
import Avatar from '../../components/ui/Avatar';
import { cn } from '../../utils/helpers';

const STATUS_COLORS: Record<string, string> = {
  NEW: '#6366f1', CONTACTED: '#3b82f6', INTERESTED: '#f59e0b',
  CONFIRMED: '#22c55e', LOST: '#ef4444', NOT_RESPONDING: '#94a3b8',
};
const PRIORITY_COLORS: Record<string, string> = {
  HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#22c55e',
};
const PIE_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6'];

type Period = '7d' | '30d' | '90d' | 'custom';
type Tab = 'leads' | 'performance' | 'campaigns' | 'lost_reasons' | 'trend';

const PERIODS: { key: Period; label: string; days?: number }[] = [
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
  { key: 'custom', label: 'Custom range' },
];

const TABS: { key: Tab; label: string }[] = [
  { key: 'leads', label: 'Lead Analytics' },
  { key: 'performance', label: 'Employee Performance' },
  { key: 'campaigns', label: 'Campaign Report' },
  { key: 'lost_reasons', label: 'Lost Reasons' },
  { key: 'trend', label: 'Daily Trend' },
];

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-slate-500">{label}</span>
        <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center', color)}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('leads');

  const { startDate, endDate } = useMemo(() => {
    if (period === 'custom') return { startDate: customStart, endDate: customEnd };
    const p = PERIODS.find((p) => p.key === period)!;
    const end = new Date();
    const start = new Date(Date.now() - (p.days! - 1) * 86400000);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }, [period, customStart, customEnd]);

  const params = { startDate, endDate };
  const { data: leadData, isLoading: leadLoading } = useLeadReport(params);
  const { data: perfData, isLoading: perfLoading } = usePerformanceReport(params);
  const { data: lostData, isLoading: lostLoading } = useLostReasonReport(params);
  const { data: campaignData, isLoading: campaignLoading } = useCampaignReport(params);
  const { data: trendData, isLoading: trendLoading } = useDailyTrend(params);

  const leadSummary = leadData?.data?.summary;
  const byStatus = leadData?.data?.byStatus ?? [];
  const bySource = leadData?.data?.bySource ?? [];
  const byPriority = leadData?.data?.byPriority ?? [];
  const employees = perfData?.data?.employees ?? [];
  const topCampaigns = perfData?.data?.topCampaigns ?? [];
  const lostReasons = lostData?.data?.reasons ?? [];
  const lostTotal = lostData?.data?.total ?? 0;
  const campaigns = campaignData?.data?.campaigns ?? [];
  const trend = trendData?.data?.trend ?? [];

  const getExportRows = () => {
    const date = `${startDate}-to-${endDate}`;
    if (activeTab === 'leads') return {
      name: `lead-analytics-${date}`,
      title: 'Lead Analytics Report',
      rows: [
        ...(leadSummary ? [
          { Metric: 'Total Leads', Value: leadSummary.totalLeads },
          { Metric: 'Confirmed', Value: leadSummary.confirmedLeads },
          { Metric: 'Lost', Value: leadSummary.lostLeads },
          { Metric: 'Conversion Rate %', Value: leadSummary.conversionRate },
        ] : []),
        ...byStatus.map((r: any) => ({ 'By Status': r.name, Count: r.count })),
      ],
    };
    if (activeTab === 'performance') return {
      name: `employee-performance-${date}`,
      title: 'Employee Performance Report',
      rows: employees.map((e: any) => ({
        Employee: e.name, 'Total Leads': e.totalLeads, Confirmed: e.confirmed,
        Lost: e.lost, 'Follow-ups': e.followUps, 'Conversion Rate %': e.conversionRate,
      })),
    };
    if (activeTab === 'campaigns') return {
      name: `campaign-report-${date}`,
      title: 'Campaign Report',
      rows: campaigns.map((c: any) => ({
        Campaign: c.name, Status: c.status, Destination: c.destination || '',
        Total: c.total, Confirmed: c.confirmed, Lost: c.lost, 'Conversion Rate %': c.conversionRate,
      })),
    };
    if (activeTab === 'lost_reasons') return {
      name: `lost-reasons-${date}`,
      title: 'Lost Reasons Report',
      rows: lostReasons.map((r: any) => ({
        Reason: r.reason, Count: r.count,
        'Percentage %': lostTotal > 0 ? ((r.count / lostTotal) * 100).toFixed(1) : 0,
      })),
    };
    return {
      name: `daily-trend-${date}`,
      title: 'Daily Trend Report',
      rows: trend.map((t: any) => ({ Date: t.date, 'Leads Created': t.created, Confirmed: t.confirmed, Lost: t.lost })),
    };
  };

  const handleExport = (format: 'xlsx' | 'csv' | 'pdf') => {
    const { name, title, rows } = getExportRows();
    if (format === 'xlsx') exportRowsToExcel(`${name}.xlsx`, rows, title);
    else if (format === 'csv') exportRowsToCSV(`${name}.csv`, rows);
    else exportRowsToPDF(`${name}.pdf`, rows, title);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Reports</h2>
          <p className="text-sm text-slate-500 mt-0.5">Performance insights and analytics</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => handleExport('csv')} className="btn-secondary flex items-center gap-2 text-sm">
            <FileDown className="w-4 h-4" />CSV
          </button>
          <button onClick={() => handleExport('xlsx')} className="btn-secondary flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" />Excel
          </button>
          <button onClick={() => handleExport('pdf')} className="btn-secondary flex items-center gap-2 text-sm">
            <FileText className="w-4 h-4" />PDF
          </button>
        </div>
      </div>

      {/* Period selector */}
      <div className="card p-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl flex-wrap">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                period === p.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="input py-1.5 text-sm" />
            <span className="text-slate-400 text-sm">→</span>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="input py-1.5 text-sm" />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit flex-wrap">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
              activeTab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Lead Analytics ── */}
      {activeTab === 'leads' && (
        leadLoading ? <LoadingSpinner /> : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Total Leads" value={leadSummary?.totalLeads ?? 0} icon={Users} color="bg-primary-500" />
              <StatCard label="Confirmed" value={leadSummary?.confirmedLeads ?? 0} icon={CheckCircle} color="bg-green-500" />
              <StatCard label="Lost" value={leadSummary?.lostLeads ?? 0} icon={XCircle} color="bg-red-500" />
              <StatCard label="Conversion Rate" value={`${leadSummary?.conversionRate ?? 0}%`} icon={TrendingUp} color="bg-indigo-500" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="card p-5">
                <h3 className="font-semibold text-slate-800 mb-4 text-sm">Leads by Status</h3>
                {byStatus.length === 0 ? <EmptyChart /> : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={byStatus} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {byStatus.map((entry: any) => (
                          <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || '#6366f1'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="card p-5">
                <h3 className="font-semibold text-slate-800 mb-4 text-sm">Leads by Source</h3>
                {bySource.length === 0 ? <EmptyChart /> : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={bySource} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {bySource.map((_: any, idx: number) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="card p-5">
                <h3 className="font-semibold text-slate-800 mb-4 text-sm">Leads by Priority</h3>
                {byPriority.length === 0 ? <EmptyChart /> : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={byPriority} layout="vertical" margin={{ top: 0, right: 0, left: 20, bottom: 0 }}>
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={60} />
                      <Tooltip />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {byPriority.map((entry: any) => (
                          <Cell key={entry.name} fill={PRIORITY_COLORS[entry.name] || '#6366f1'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </>
        )
      )}

      {/* ── Employee Performance ── */}
      {activeTab === 'performance' && (
        perfLoading ? <LoadingSpinner /> : (
          <>
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800 text-sm">Employee Performance</h3>
              </div>
              {employees.length === 0 ? (
                <div className="py-12 text-center">
                  <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">No data for this period</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Employee</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Confirmed</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Lost</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Follow-ups</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Conv. %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((emp: any, idx: number) => (
                        <tr key={emp.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-slate-400 w-4 text-center font-medium">{idx + 1}</span>
                              <Avatar name={emp.name} size="sm" />
                              <span className="text-sm font-medium text-slate-800">{emp.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-right text-sm text-slate-700">{emp.totalLeads}</td>
                          <td className="px-4 py-3.5 text-right">
                            <span className="text-sm font-semibold text-green-600">{emp.confirmed}</span>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <span className="text-sm text-red-500">{emp.lost}</span>
                          </td>
                          <td className="px-4 py-3.5 text-right text-sm text-slate-600">{emp.followUps}</td>
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div className="h-full bg-primary-500 rounded-full" style={{ width: `${Math.min(emp.conversionRate, 100)}%` }} />
                              </div>
                              <span className="text-sm font-medium text-slate-700 w-10 text-right">{emp.conversionRate}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {topCampaigns.length > 0 && (
              <div className="card p-5">
                <h3 className="font-semibold text-slate-800 mb-4 text-sm">Top Campaigns (by lead count)</h3>
                <div className="space-y-2">
                  {topCampaigns.map((c: any, idx: number) => (
                    <div key={c.id} className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 w-4 font-medium">{idx + 1}</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-slate-700">{c.name}</span>
                          <span className="text-xs text-slate-500">{c._count?.leads ?? 0} leads</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary-400 rounded-full"
                            style={{ width: `${Math.min(((c._count?.leads ?? 0) / (topCampaigns[0]?._count?.leads || 1)) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )
      )}

      {/* ── Campaign Report ── */}
      {activeTab === 'campaigns' && (
        campaignLoading ? <LoadingSpinner /> : (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800 text-sm">Campaign Performance</h3>
              <p className="text-xs text-slate-500 mt-0.5">Showing campaigns with at least 1 lead in the selected period</p>
            </div>
            {campaigns.length === 0 ? (
              <div className="py-12 text-center">
                <Megaphone className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">No campaign data for this period</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">#</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Campaign</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Confirmed</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Lost</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Conv. %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c: any, idx: number) => (
                      <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3.5 text-xs text-slate-400">{idx + 1}</td>
                        <td className="px-4 py-3.5">
                          <p className="text-sm font-medium text-slate-800">{c.name}</p>
                          {c.destination && <p className="text-xs text-slate-400">{c.destination}</p>}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={cn(
                            'text-xs px-2 py-0.5 rounded-full font-medium',
                            c.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                            c.status === 'PAUSED' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-slate-100 text-slate-600'
                          )}>{c.status}</span>
                        </td>
                        <td className="px-4 py-3.5 text-right text-sm font-semibold text-slate-700">{c.total}</td>
                        <td className="px-4 py-3.5 text-right">
                          <span className="text-sm font-semibold text-green-600">{c.confirmed}</span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className="text-sm text-red-500">{c.lost}</span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className={cn(
                            'text-sm font-semibold',
                            c.conversionRate >= 50 ? 'text-green-600' : c.conversionRate >= 25 ? 'text-yellow-600' : 'text-red-500'
                          )}>{c.conversionRate}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      )}

      {/* ── Lost Reasons ── */}
      {activeTab === 'lost_reasons' && (
        lostLoading ? <LoadingSpinner /> : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <StatCard label="Total Lost Leads" value={lostTotal} icon={XCircle} color="bg-red-500" />
              <StatCard label="Distinct Reasons" value={lostReasons.length} icon={AlertTriangle} color="bg-orange-500" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="card p-5">
                <h3 className="font-semibold text-slate-800 mb-4 text-sm">Lost Leads by Reason</h3>
                {lostReasons.length === 0 ? <EmptyChart /> : (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={lostReasons} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="reason" tick={{ fontSize: 11 }} width={120} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="card p-5">
                <h3 className="font-semibold text-slate-800 mb-4 text-sm">Breakdown</h3>
                {lostReasons.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <div className="space-y-3">
                    {lostReasons.map((r: any, idx: number) => {
                      const pct = lostTotal > 0 ? ((r.count / lostTotal) * 100).toFixed(1) : '0';
                      return (
                        <div key={idx}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-slate-700 truncate">{r.reason}</span>
                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              <span className="text-xs text-slate-500">{r.count}</span>
                              <span className="text-xs font-semibold text-red-600 w-10 text-right">{pct}%</span>
                            </div>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-red-400 rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      )}

      {/* ── Daily Trend ── */}
      {activeTab === 'trend' && (
        trendLoading ? <LoadingSpinner /> : (
          <div className="space-y-5">
            <div className="card p-5">
              <h3 className="font-semibold text-slate-800 mb-4 text-sm">Daily Lead Trend</h3>
              {trend.length === 0 ? <EmptyChart /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trend} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip labelFormatter={(v) => `Date: ${v}`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="created" name="Created" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="confirmed" name="Confirmed" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="lost" name="Lost" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {trend.length > 0 && (
              <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-800 text-sm">Daily Breakdown</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Created</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Confirmed</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Lost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...trend].reverse().map((t: any) => (
                        <tr key={t.date} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-3 text-sm font-medium text-slate-700">{t.date}</td>
                          <td className="px-4 py-3 text-right text-sm text-slate-600">{t.created}</td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-semibold text-green-600">{t.confirmed}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm text-red-500">{t.lost}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
    </div>
  );
}

function EmptyChart() {
  return <p className="text-center text-slate-400 py-8 text-sm">No data for this period</p>;
}
