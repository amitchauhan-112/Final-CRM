import { useState } from 'react';
import {
  Users, Megaphone, CheckCircle, AlertCircle, Activity,
  TrendingUp, Calendar, Download, Star, Clock, Target,
  ArrowUp, ArrowDown, Minus, Trophy, Zap, Plus,
  ChevronRight, Flag, BarChart2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useLeadStats, useRecentActivity, useLeads } from '../../hooks/useLeads';
import { useCampaignStats } from '../../hooks/useCampaigns';
import { useEmployeePerformance } from '../../hooks/useUsers';
import { useDashboardStats } from '../../hooks/useDashboard';
import StatsCard from '../ui/StatsCard';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import { SkeletonDashboard } from '../ui/Skeleton';
import { formatRelativeTime, formatCurrency, leadStatusConfig, cn } from '../../utils/helpers';
import { LeadStatus } from '../../types/index';
import { exportLeadsToExcel, exportUsersToExcel, exportCampaignsToExcel } from '../../utils/export';
import toast from 'react-hot-toast';

const STATUS_COLORS: Record<LeadStatus, string> = {
  NEW: '#0ea5e9',
  NOT_CONTACTED: '#64748b',
  CONTACTED: '#eab308',
  INTERESTED: '#8b5cf6',
  FOLLOW_UP_SCHEDULED: '#f97316',
  CONFIRMED: '#22c55e',
  LOST: '#ef4444',
};

const SOURCE_COLORS: Record<string, string> = {
  WHATSAPP: '#22c55e',
  INSTAGRAM: '#ec4899',
  MANUAL: '#64748b',
  WEBSITE: '#3b82f6',
};

const AGE_CONFIG = [
  { key: 'fresh',  label: 'Fresh',    desc: '< 1 day',   color: 'bg-green-500',  text: 'text-green-700',  badge: 'bg-green-100' },
  { key: 'recent', label: 'Recent',   desc: '1–3 days',  color: 'bg-blue-500',   text: 'text-blue-700',   badge: 'bg-blue-100' },
  { key: 'aging',  label: 'Aging',    desc: '3–7 days',  color: 'bg-yellow-500', text: 'text-yellow-700', badge: 'bg-yellow-100' },
  { key: 'old',    label: 'Old',      desc: '7–14 days', color: 'bg-orange-500', text: 'text-orange-700', badge: 'bg-orange-100' },
  { key: 'stale',  label: 'Stale',    desc: '14+ days',  color: 'bg-red-500',    text: 'text-red-700',    badge: 'bg-red-100' },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function DailyActivityCard({ daily }: { daily: { created: number; updated: number; transferred: number; confirmed: number; lost: number } }) {
  const items = [
    { label: 'Created',     value: daily.created,     color: 'text-blue-600',   bg: 'bg-blue-50',   icon: '➕' },
    { label: 'Updated',     value: daily.updated,     color: 'text-purple-600', bg: 'bg-purple-50', icon: '✏️' },
    { label: 'Transferred', value: daily.transferred, color: 'text-orange-600', bg: 'bg-orange-50', icon: '🔄' },
    { label: 'Confirmed',   value: daily.confirmed,   color: 'text-green-600',  bg: 'bg-green-50',  icon: '✅' },
    { label: 'Lost',        value: daily.lost,        color: 'text-red-600',    bg: 'bg-red-50',    icon: '❌' },
  ];
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-slate-700">Today's Activity</h3>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {items.map((item) => (
          <div key={item.label} className={cn('rounded-xl p-2.5 text-center', item.bg)}>
            <div className="text-base mb-0.5">{item.icon}</div>
            <p className={cn('text-xl font-bold', item.color)}>{item.value}</p>
            <p className="text-xs text-slate-500 leading-tight mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function FollowUpHealthCard({ health }: { health: { today: number; done: number; pending: number; overdue: number } }) {
  const navigate = useNavigate();
  const items = [
    { label: 'Today',    value: health.today,   color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200',  icon: Calendar },
    { label: 'Done',     value: health.done,    color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200', icon: CheckCircle },
    { label: 'Pending',  value: health.pending, color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200',icon: Clock },
    { label: 'Overdue',  value: health.overdue, color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200',   icon: AlertCircle },
  ];
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="w-4 h-4 text-primary-500" />
        <h3 className="text-sm font-semibold text-slate-700">Follow-up Health</h3>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              onClick={() => navigate('/admin/leads?status=FOLLOW_UP_SCHEDULED')}
              className={cn('rounded-xl p-3 border text-left transition-all hover:shadow-sm', item.bg, item.border)}
            >
              <div className="flex items-center justify-between mb-1">
                <Icon className={cn('w-4 h-4', item.color)} />
              </div>
              <p className={cn('text-2xl font-bold', item.color)}>{item.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{item.label}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LeadAgeWidget({ age }: { age: { fresh: number; recent: number; aging: number; old: number; stale: number } }) {
  const total = Object.values(age).reduce((a, b) => a + b, 0);
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700">Lead Age Distribution</h3>
        </div>
        <span className="text-xs text-slate-400">{total} active leads</span>
      </div>
      <div className="space-y-2.5">
        {AGE_CONFIG.map((cfg) => {
          const count = age[cfg.key as keyof typeof age];
          const pct = total > 0 ? (count / total) * 100 : 0;
          return (
            <div key={cfg.key} className="flex items-center gap-3">
              <div className={cn('text-xs font-medium w-12 shrink-0', cfg.text)}>{cfg.label}</div>
              <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', cfg.color)}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex items-center gap-2 w-20 shrink-0 justify-end">
                <span className={cn('text-xs font-bold', cfg.text)}>{count}</span>
                <span className="text-xs text-slate-400">({pct.toFixed(0)}%)</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {AGE_CONFIG.map((cfg) => (
          <span key={cfg.key} className={cn('text-xs px-2 py-0.5 rounded-full font-medium', cfg.badge, cfg.text)}>
            {cfg.desc}
          </span>
        ))}
      </div>
    </div>
  );
}

function WorkloadWidget({ workload }: { workload: { id: string; name: string; activeLeads: number }[] }) {
  const max = Math.max(...workload.map((w) => w.activeLeads), 1);
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-4 h-4 text-primary-500" />
        <h3 className="text-sm font-semibold text-slate-700">Employee Workload</h3>
      </div>
      {workload.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-sm">No employees</div>
      ) : (
        <div className="space-y-2.5">
          {workload.map((emp) => {
            const pct = (emp.activeLeads / max) * 100;
            const color = emp.activeLeads > max * 0.8 ? 'bg-red-500' : emp.activeLeads > max * 0.5 ? 'bg-orange-500' : 'bg-green-500';
            return (
              <div key={emp.id} className="flex items-center gap-3">
                <Avatar name={emp.name} size="xs" className="flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-700 truncate">{emp.name}</span>
                    <span className="text-xs font-bold text-slate-600 ml-2 shrink-0">{emp.activeLeads}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RecentConfirmedWidget({ bookings }: { bookings: { id: string; name: string; phone: string; destination?: string; budget?: number; groupSize?: number; updatedAt: string; assignedTo?: { name: string } }[] }) {
  const navigate = useNavigate();
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-yellow-500" />
          <h3 className="text-sm font-semibold text-slate-700">Recent Confirmed Bookings</h3>
        </div>
        <button onClick={() => navigate('/admin/leads?status=CONFIRMED')} className="text-xs text-primary-600 hover:text-primary-700 font-medium">
          View all
        </button>
      </div>
      {bookings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-slate-400">
          <CheckCircle className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-sm">No confirmed bookings yet</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {bookings.map((b) => (
            <div key={b.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
              <div className="w-8 h-8 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-4 h-4 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{b.name}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {b.destination && <span className="text-xs text-slate-500">{b.destination}</span>}
                  {b.groupSize && <span className="text-xs text-slate-400">· {b.groupSize} pax</span>}
                  {b.budget && <span className="text-xs text-green-600 font-medium">· {formatCurrency(b.budget)}</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                {b.assignedTo && <p className="text-xs text-slate-500">{b.assignedTo.name}</p>}
                <p className="text-xs text-slate-400">{formatRelativeTime(b.updatedAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LeaderboardWidget({ performance }: { performance: { id: string; name: string; email: string; confirmed: number; total: number; conversionRate: string; overdue: number }[] }) {
  const sorted = [...performance].sort((a, b) => b.confirmed - a.confirmed || parseFloat(b.conversionRate) - parseFloat(a.conversionRate));
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
        <Trophy className="w-4 h-4 text-yellow-500" />
        <h3 className="text-sm font-semibold text-slate-700">Employee Leaderboard</h3>
      </div>
      {sorted.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-sm">No data yet</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {sorted.map((emp, idx) => {
            const rate = parseFloat(emp.conversionRate);
            const rateColor = rate >= 50 ? 'text-green-600' : rate >= 25 ? 'text-yellow-600' : 'text-red-600';
            return (
              <div key={emp.id} className={cn('flex items-center gap-3 px-5 py-3', idx === 0 && 'bg-yellow-50/50')}>
                <span className="text-lg w-6 text-center flex-shrink-0">{medals[idx] ?? `#${idx + 1}`}</span>
                <Avatar name={emp.name} size="sm" className="flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{emp.name}</p>
                  <p className="text-xs text-slate-400 truncate">{emp.email}</p>
                </div>
                <div className="flex items-center gap-4 text-right shrink-0">
                  <div>
                    <p className="text-sm font-bold text-green-700">{emp.confirmed}</p>
                    <p className="text-xs text-slate-400">Confirmed</p>
                  </div>
                  <div>
                    <p className={cn('text-sm font-bold', rateColor)}>{emp.conversionRate}%</p>
                    <p className="text-xs text-slate-400">Conv.</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700">{emp.total}</p>
                    <p className="text-xs text-slate-400">Total</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ExportBar() {
  const [loading, setLoading] = useState<string | null>(null);

  const doExport = async (label: string, fn: () => Promise<void>) => {
    setLoading(label);
    try {
      await fn();
      toast.success(`${label} exported successfully`);
    } catch {
      toast.error(`Failed to export ${label}`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-slate-500 font-medium">Export:</span>
      {[
        { label: 'Leads', fn: () => exportLeadsToExcel() },
        { label: 'Employees', fn: exportUsersToExcel },
        { label: 'Campaigns', fn: exportCampaignsToExcel },
      ].map(({ label, fn }) => (
        <button
          key={label}
          onClick={() => doExport(label, fn)}
          disabled={loading === label}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50"
        >
          <Download className="w-3 h-3 text-slate-500" />
          {loading === label ? 'Exporting...' : label}
        </button>
      ))}
    </div>
  );
}

function QuickActionsWidget() {
  const navigate = useNavigate();
  const actions = [
    { label: 'New Lead',        icon: Plus,      color: 'text-primary-600 bg-primary-50 hover:bg-primary-100 border-primary-200', action: () => navigate('/admin/leads') },
    { label: 'High Priority',   icon: Flag,       color: 'text-red-600 bg-red-50 hover:bg-red-100 border-red-200',               action: () => navigate('/admin/leads') },
    { label: 'Overdue',         icon: AlertCircle,color: 'text-orange-600 bg-orange-50 hover:bg-orange-100 border-orange-200',   action: () => navigate('/admin/leads?status=FOLLOW_UP_SCHEDULED') },
    { label: 'Confirmed',       icon: CheckCircle,color: 'text-green-600 bg-green-50 hover:bg-green-100 border-green-200',       action: () => navigate('/admin/leads?status=CONFIRMED') },
    { label: 'Campaigns',       icon: Megaphone,  color: 'text-violet-600 bg-violet-50 hover:bg-violet-100 border-violet-200',   action: () => navigate('/admin/campaigns') },
    { label: 'Reports',         icon: BarChart2,  color: 'text-sky-600 bg-sky-50 hover:bg-sky-100 border-sky-200',               action: () => navigate('/admin/reports') },
  ];

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-slate-700">Quick Actions</h3>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.label}
              onClick={a.action}
              className={cn('flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-center transition-all', a.color)}
            >
              <Icon className="w-4 h-4" />
              <span className="text-xs font-medium leading-tight">{a.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HighPriorityWidget({ organizationId }: { organizationId?: string }) {
  const navigate = useNavigate();
  const { data } = useLeads({ priority: 'HIGH', limit: 6 } as any);
  const leads = (data?.data ?? []).filter((l) => l.status !== 'CONFIRMED' && l.status !== 'LOST');
  const total = data?.meta?.total ?? 0;
  const activeHighPriority = leads.length;

  if (activeHighPriority === 0) return null;

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flag className="w-4 h-4 text-red-500" />
          <h3 className="text-sm font-semibold text-slate-700">High Priority Leads</h3>
          <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{activeHighPriority}</span>
        </div>
        <button onClick={() => navigate('/admin/leads')} className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
          View all <ChevronRight className="w-3 h-3" />
        </button>
      </div>
      <div className="divide-y divide-slate-100">
        {leads.slice(0, 5).map((l) => (
          <div key={l.id} className="flex items-center gap-3 px-5 py-3 hover:bg-red-50/50 transition-colors">
            <div className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{l.name}</p>
              <p className="text-xs text-slate-400 truncate">{l.phone}{l.destination ? ` · ${l.destination}` : ''}</p>
            </div>
            <div className="text-right shrink-0">
              <span className={cn(
                'text-xs px-1.5 py-0.5 rounded-full font-medium',
                l.status === 'NEW' ? 'bg-sky-100 text-sky-700' :
                l.status === 'CONTACTED' ? 'bg-yellow-100 text-yellow-700' :
                l.status === 'INTERESTED' ? 'bg-violet-100 text-violet-700' :
                'bg-orange-100 text-orange-700'
              )}>{l.status.replace('_', ' ')}</span>
              {l.followUpDate && !l.followUpDone && (
                <p className={cn('text-xs mt-0.5', new Date(l.followUpDate) < new Date() ? 'text-red-500 font-medium' : 'text-slate-400')}>
                  {new Date(l.followUpDate) < new Date() ? '⚠ ' : ''}{l.followUpDate.slice(0, 10)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { data: statsData, isLoading: statsLoading } = useLeadStats();
  const { data: campaignStatsData, isLoading: campLoading } = useCampaignStats();
  const { data: perfData, isLoading: perfLoading } = useEmployeePerformance();
  const { data: activityData } = useRecentActivity();
  const { data: dashData, isLoading: dashLoading } = useDashboardStats();

  const stats = statsData?.data;
  const campaignStats = campaignStatsData?.data ?? [];
  const performance = perfData?.data ?? [];
  const activity = activityData?.data ?? [];
  const dash = dashData?.data;

  if (statsLoading || dashLoading) return <SkeletonDashboard />;

  const pieData = stats
    ? Object.entries(stats.byStatus)
        .filter(([, v]) => v > 0)
        .map(([key, value]) => ({
          name: leadStatusConfig[key as LeadStatus]?.label ?? key,
          value,
          color: STATUS_COLORS[key as LeadStatus] ?? '#94a3b8',
        }))
    : [];

  const sourceBarData = stats
    ? Object.entries(stats.bySource).map(([source, count]) => ({
        name: source.charAt(0) + source.slice(1).toLowerCase(),
        leads: count,
        fill: SOURCE_COLORS[source] ?? '#64748b',
      }))
    : [];

  return (
    <div className="space-y-5">
      {/* Header with export */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Dashboard</h2>
          <p className="page-subtitle">Overview of your travel CRM</p>
        </div>
        <ExportBar />
      </div>

      {/* Row 1 — KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatsCard
          label="Total Leads"
          value={stats?.total ?? 0}
          icon={Users}
          iconBg="bg-primary-100"
          iconColor="text-primary-600"
          onClick={() => navigate('/admin/leads')}
        />
        <StatsCard
          label="Active Campaigns"
          value={campaignStats.filter((c) => c.status === 'ACTIVE').length}
          icon={Megaphone}
          iconBg="bg-mountain-100"
          iconColor="text-mountain-600"
          onClick={() => navigate('/admin/campaigns')}
        />
        <StatsCard
          label="Confirmed Bookings"
          value={stats?.byStatus?.CONFIRMED ?? 0}
          icon={CheckCircle}
          iconBg="bg-green-100"
          iconColor="text-green-600"
          onClick={() => navigate('/admin/leads?status=CONFIRMED')}
        />
        <StatsCard
          label="Overdue Follow-ups"
          value={stats?.overdue ?? 0}
          icon={AlertCircle}
          iconBg="bg-red-100"
          iconColor="text-red-600"
          onClick={() => navigate('/admin/leads?status=FOLLOW_UP_SCHEDULED')}
        />
      </div>

      {/* Row 2 — Quick Actions */}
      <QuickActionsWidget />

      {/* Row 2.5 — Daily Activity */}
      {dash && <DailyActivityCard daily={dash.daily} />}

      {/* Row 3 — Charts + Follow-up Health */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Source bar chart */}
        <div className="card p-5 lg:col-span-3">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Lead Source Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sourceBarData} barCategoryGap="40%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }}
              />
              <Bar dataKey="leads" radius={[4, 4, 0, 0]}>
                {sourceBarData.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Status pie */}
        <div className="card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Leads by Status</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="45%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-44 text-slate-400 text-sm">No data yet</div>
          )}
        </div>
      </div>

      {/* Row 4 — Lead Age + Follow-up Health */}
      {dash && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <LeadAgeWidget age={dash.leadAge} />
          </div>
          <FollowUpHealthCard health={dash.followUpHealth} />
        </div>
      )}

      {/* Row 5 — Campaign Table (enhanced) + Recent Confirmed */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <div className="card xl:col-span-3 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Campaign Performance</h3>
            <button onClick={() => navigate('/admin/campaigns')} className="text-xs text-primary-600 hover:text-primary-700 font-medium">
              Manage
            </button>
          </div>
          {campLoading ? (
            <div className="p-6"><div className="h-32 bg-slate-100 animate-pulse rounded-lg" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Campaign</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Pending</th>
                    <th className="text-right">Confirmed</th>
                    <th className="text-right">Lost</th>
                    <th className="text-right">Conv%</th>
                  </tr>
                </thead>
                <tbody>
                  {campaignStats.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center">
                        <div className="empty-state">
                          <Megaphone className="empty-state-icon" />
                          <p className="empty-state-title">No campaigns yet</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    campaignStats.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <p className="font-medium text-slate-800 truncate max-w-[130px]">{c.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="text-xs text-slate-400 truncate">{c.destination}</p>
                            <Badge campaignStatus={c.status} />
                          </div>
                        </td>
                        <td className="text-right font-semibold text-slate-700 tabular">{c.total}</td>
                        <td className="text-right font-semibold text-orange-600 tabular">{c.pending ?? c.active}</td>
                        <td className="text-right font-semibold text-emerald-700 tabular">{c.confirmed}</td>
                        <td className="text-right font-semibold text-red-600 tabular">{c.lost}</td>
                        <td className="text-right">
                          <span className={cn('font-semibold tabular', parseFloat(c.conversionRate) >= 50 ? 'text-emerald-600' : parseFloat(c.conversionRate) >= 25 ? 'text-amber-600' : 'text-red-600')}>
                            {c.conversionRate}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {dash && (
          <div className="xl:col-span-2">
            <RecentConfirmedWidget bookings={dash.recentConfirmed} />
          </div>
        )}
      </div>

      {/* Row 6 — High Priority Leads + Leaderboard + Workload */}
      <HighPriorityWidget />

      {dash && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <div className="xl:col-span-3">
            <LeaderboardWidget performance={performance} />
          </div>
          <div className="xl:col-span-2">
            <WorkloadWidget workload={dash.workload} />
          </div>
        </div>
      )}

      {/* Row 7 — Recent Activity */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">Recent Activity</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 max-h-64 overflow-y-auto scrollbar-thin">
          {activity.length === 0 ? (
            <p className="text-sm text-slate-400 col-span-full text-center py-6">No recent activity</p>
          ) : (
            activity.map((log) => (
              <div key={log.id} className="flex gap-3">
                <Avatar name={log.user.name} size="xs" className="mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate">{log.action}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-xs text-slate-400">{log.user.name}</span>
                    <span className="text-xs text-slate-300">·</span>
                    <span className="text-xs text-slate-400">{formatRelativeTime(log.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
