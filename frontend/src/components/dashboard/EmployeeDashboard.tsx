import { useState, useMemo, useCallback } from 'react';
import {
  Users, Calendar, CalendarClock, CheckCircle, AlertCircle, Star, Clock,
  TrendingUp, XCircle, Eye, ChevronRight, Bell, Sparkles, PhoneOff,
} from 'lucide-react';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useLeads, useOverdueFollowUps, useUpdateLead } from '../../hooks/useLeads';
import { useAuthStore } from '../../store/authStore';
import { useStarredLeads } from '../../hooks/useStarredLeads';
import { useRecentViews } from '../../hooks/useRecentViews';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import StatsCard from '../ui/StatsCard';
import DateRangeFilter from '../ui/DateRangeFilter';
import LeadCard from '../leads/LeadCard';
import LeadDetail from '../leads/LeadDetail';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import { SkeletonDashboard } from '../ui/Skeleton';
import { formatDate, formatRelativeTime, isOverdue, leadStatusConfig, cn } from '../../utils/helpers';
import { rangeForDays, RangePreset } from '../../utils/dateRange';
import { Lead, LeadStatus } from '../../types/index';

const STATUS_COLORS: Record<LeadStatus, string> = {
  NEW: '#0ea5e9',
  NOT_CONTACTED: '#64748b',
  CONTACTED: '#eab308',
  INTERESTED: '#8b5cf6',
  FOLLOW_UP_SCHEDULED: '#f97316',
  CONFIRMED: '#22c55e',
  LOST: '#ef4444',
};

// ─── Next Follow-up Card ─────────────────────────────────────────────────────

function NextFollowUpCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const followUpDate = lead.followUpDate ? new Date(lead.followUpDate) : null;
  const now = new Date();
  const diffMs = followUpDate ? followUpDate.getTime() - now.getTime() : 0;
  const isOverdueFlag = diffMs < 0;
  const diffMins = Math.abs(Math.floor(diffMs / 60000));
  const diffHrs = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHrs / 24);

  const timeLabel = isOverdueFlag
    ? diffDays > 0 ? `${diffDays}d overdue` : diffHrs > 0 ? `${diffHrs}h overdue` : `${diffMins}m overdue`
    : diffDays > 0 ? `in ${diffDays}d` : diffHrs > 0 ? `in ${diffHrs}h` : `in ${diffMins}m`;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full card p-5 text-left transition-all hover:shadow-md',
        isOverdueFlag ? 'border-red-200 bg-red-50/40' : 'border-orange-200 bg-orange-50/40'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Bell className={cn('w-4 h-4', isOverdueFlag ? 'text-red-500' : 'text-orange-500')} />
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Next Follow-up</span>
          </div>
          <p className="font-bold text-slate-900 truncate text-lg">{lead.name}</p>
          <p className="text-sm text-slate-500 mt-0.5">{lead.phone}</p>
          {lead.followUpNotes && (
            <p className="text-xs text-slate-600 mt-2 italic line-clamp-2">"{lead.followUpNotes}"</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className={cn('text-xl font-bold', isOverdueFlag ? 'text-red-600' : 'text-orange-600')}>{timeLabel}</p>
          <p className="text-xs text-slate-400 mt-1">{formatDate(lead.followUpDate)}</p>
          <Badge status={lead.status} className="mt-2" />
        </div>
      </div>
    </button>
  );
}

// ─── Starred Leads Section ───────────────────────────────────────────────────

function StarredSection({
  leads,
  starredIds,
  onToggleStar,
  onOpenLead,
}: {
  leads: Lead[];
  starredIds: string[];
  onToggleStar: (id: string) => void;
  onOpenLead: (id: string) => void;
}) {
  const starredLeads = leads.filter((l) => starredIds.includes(l.id));
  if (starredLeads.length === 0) return null;

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
        <h3 className="text-sm font-semibold text-slate-700">Starred Leads</h3>
        <span className="text-xs text-slate-400 ml-auto">{starredLeads.length}</span>
      </div>
      <div className="space-y-2">
        {starredLeads.map((lead) => (
          <div key={lead.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
            <Avatar name={lead.name} size="sm" className="flex-shrink-0" />
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onOpenLead(lead.id)}>
              <p className="text-sm font-semibold text-slate-800 truncate">{lead.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-400">{lead.phone}</span>
                <Badge status={lead.status} />
              </div>
            </div>
            <button
              onClick={() => onToggleStar(lead.id)}
              className="p-1.5 rounded-lg hover:bg-yellow-50 transition-colors flex-shrink-0"
            >
              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Recently Viewed ─────────────────────────────────────────────────────────

function RecentlyViewedSection({
  leads,
  viewIds,
  onOpenLead,
}: {
  leads: Lead[];
  viewIds: string[];
  onOpenLead: (id: string) => void;
}) {
  const recentLeads = viewIds.map((id) => leads.find((l) => l.id === id)).filter(Boolean) as Lead[];
  if (recentLeads.length === 0) return null;

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Eye className="w-4 h-4 text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-700">Recently Viewed</h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {recentLeads.map((lead) => (
          <button
            key={lead.id}
            onClick={() => onOpenLead(lead.id)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors text-sm"
          >
            <Avatar name={lead.name} size="xs" />
            <span className="font-medium text-slate-700 max-w-[120px] truncate">{lead.name}</span>
            <Badge status={lead.status} />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Quick Status Update ──────────────────────────────────────────────────────

const STATUS_ORDER: LeadStatus[] = ['NEW', 'CONTACTED', 'INTERESTED', 'FOLLOW_UP_SCHEDULED', 'CONFIRMED', 'LOST'];

function QuickStatusPanel({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const updateLead = useUpdateLead();

  const handleStatus = (status: LeadStatus) => {
    updateLead.mutate({ id: lead.id, status }, { onSuccess: onClose });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <Avatar name={lead.name} size="md" />
          <div>
            <p className="font-bold text-slate-900">{lead.name}</p>
            <p className="text-xs text-slate-500">Update status</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {STATUS_ORDER.map((s) => {
            const cfg = leadStatusConfig[s];
            const isCurrent = lead.status === s;
            return (
              <button
                key={s}
                onClick={() => handleStatus(s)}
                disabled={isCurrent || updateLead.isPending}
                className={cn(
                  'py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all',
                  isCurrent
                    ? cn(cfg.bg, cfg.color, 'border-current opacity-100 cursor-default ring-2 ring-current/20')
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                )}
              >
                {isCurrent && '✓ '}{cfg.label}
              </button>
            );
          })}
        </div>
        <button onClick={onClose} className="mt-3 w-full py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Main Employee Dashboard ──────────────────────────────────────────────────

export default function EmployeeDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [quickStatusLead, setQuickStatusLead] = useState<Lead | null>(null);
  // Never persisted — a page refresh always lands back on 30 Days, even
  // after picking a custom range.
  const [rangePreset, setRangePreset] = useState<RangePreset>('30');
  const [customRange, setCustomRange] = useState(() => rangeForDays(30));
  const today = new Date().toISOString().slice(0, 10);
  const dateRange = rangePreset === 'custom' ? customRange : rangeForDays(Number(rangePreset));
  // Carried into every stat card's navigation so the Leads list opens
  // scoped to the same window instead of resetting to "all time".
  const dateQuery = `dateFrom=${dateRange.from}&dateTo=${dateRange.to}`;

  const { data: myLeadsData, isLoading } = useLeads({ assignedToId: user?.id, limit: 200 });
  const { data: statsLeadsData } = useLeads({
    assignedToId: user?.id, limit: 200, dateFrom: dateRange.from, dateTo: dateRange.to,
  });
  const { data: overdueData } = useOverdueFollowUps();
  const { starred, isStarred, toggle: toggleStar } = useStarredLeads();
  const { recentViewIds, trackView } = useRecentViews();

  const leads = myLeadsData?.data ?? [];
  const statsLeads = statsLeadsData?.data ?? [];
  const overdue = (overdueData?.data ?? []).filter((l) => l.assignedToId === user?.id);

  const openLead = useCallback((id: string) => {
    setSelectedLeadId(id);
    trackView(id);
  }, [trackView]);

  useKeyboardShortcuts([
    { key: 'n', handler: () => navigate('/employee/leads'), description: 'Go to leads' },
    { key: 'f', handler: () => navigate('/employee/follow-ups'), description: 'Go to follow-ups' },
    { key: 'Escape', handler: () => { setSelectedLeadId(null); setQuickStatusLead(null); }, description: 'Close panel' },
  ]);

  const stats = useMemo(() => {
    const todayFollowUps = leads.filter(
      (l) => l.followUpDate && l.followUpDate.startsWith(today) && !l.followUpDone && !isOverdue(l.followUpDate)
    );
    const confirmed = leads.filter((l) => l.status === 'CONFIRMED');
    const lost = leads.filter((l) => l.status === 'LOST');
    const pending = leads.filter((l) => !['CONFIRMED', 'LOST'].includes(l.status));
    // Fresh = completely untouched leads (still at their default status).
    // A subset of "pending", shown separately so it's obvious which leads
    // no one has even opened yet vs. ones already in progress.
    const fresh = leads.filter((l) => l.status === 'NEW');

    // Next upcoming follow-up (closest future one)
    const upcoming = leads
      .filter((l) => l.followUpDate && !l.followUpDone)
      .sort((a, b) => new Date(a.followUpDate!).getTime() - new Date(b.followUpDate!).getTime());
    const nextFollowUp = upcoming[0] ?? null;

    return { todayFollowUps, confirmed, lost, pending, fresh, nextFollowUp };
  }, [leads, today]);

  // Drives the top KPI row only — scoped to the selected date range (leads
  // created within it), independent of the always-unfiltered `stats` above
  // which still powers the follow-up/confirmed work-lists further down.
  const cardStats = useMemo(() => {
    const fresh = statsLeads.filter((l) => l.status === 'NEW');
    const interested = statsLeads.filter((l) => l.status === 'INTERESTED');
    const notContactable = statsLeads.filter((l) => l.status === 'NOT_CONTACTED');
    const lost = statsLeads.filter((l) => l.status === 'LOST');
    const confirmed = statsLeads.filter((l) => l.status === 'CONFIRMED');
    const todayFollowUps = statsLeads.filter(
      (l) => l.followUpDate && l.followUpDate.startsWith(today) && !l.followUpDone && !isOverdue(l.followUpDate)
    );
    const overdueFollowUps = statsLeads.filter(
      (l) => l.followUpDate && !l.followUpDone && isOverdue(l.followUpDate)
    );
    return { total: statsLeads.length, fresh, interested, notContactable, lost, confirmed, todayFollowUps, overdueFollowUps };
  }, [statsLeads, today]);

  const pieData = useMemo(() =>
    Object.entries(
      leads.reduce((acc, l) => {
        acc[l.status] = (acc[l.status] ?? 0) + 1;
        return acc;
      }, {} as Record<LeadStatus, number>)
    )
      .filter(([, v]) => v > 0)
      .map(([key, value]) => ({
        name: leadStatusConfig[key as LeadStatus]?.label ?? key,
        value,
        color: STATUS_COLORS[key as LeadStatus],
      })),
    [leads]
  );

  if (isLoading) return <SkeletonDashboard />;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'},{' '}
          {user?.name?.split(' ')[0]} 👋
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          You have <strong>{leads.length}</strong> active leads and{' '}
          <strong>{stats.todayFollowUps.length}</strong> follow-ups today.
          <span className="ml-2 text-xs text-slate-400">Press <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-xs font-mono">N</kbd> for leads, <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-xs font-mono">F</kbd> for follow-ups</span>
        </p>
      </div>

      {/* Row 1 — KPI Stats, scoped to a date range (defaults to last 30 days,
          resets on every page load — never persisted). Carried into every
          card's onClick so the Leads list it opens stays in the same window. */}
      <DateRangeFilter
        preset={rangePreset}
        onPresetChange={setRangePreset}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
        <StatsCard
          label="Total Leads"
          value={cardStats.total}
          icon={Users}
          iconBg="bg-primary-100"
          iconColor="text-primary-600"
          onClick={() => navigate(`/employee/leads?${dateQuery}`)}
        />
        <StatsCard
          label="Fresh Leads"
          value={cardStats.fresh.length}
          icon={Sparkles}
          iconBg="bg-sky-100"
          iconColor="text-sky-600"
          onClick={() => navigate(`/employee/leads?status=NEW&${dateQuery}`)}
        />
        <StatsCard
          label="Today's Follow-ups"
          value={cardStats.todayFollowUps.length}
          icon={Calendar}
          iconBg="bg-orange-100"
          iconColor="text-orange-600"
          onClick={() => navigate('/employee/follow-ups')}
        />
        <StatsCard
          label="Overdue Follow-ups"
          value={cardStats.overdueFollowUps.length}
          icon={CalendarClock}
          iconBg="bg-red-100"
          iconColor="text-red-600"
          onClick={() => navigate('/employee/follow-ups')}
        />
        <StatsCard
          label="Interested"
          value={cardStats.interested.length}
          icon={TrendingUp}
          iconBg="bg-violet-100"
          iconColor="text-violet-600"
          onClick={() => navigate(`/employee/leads?status=INTERESTED&${dateQuery}`)}
        />
        <StatsCard
          label="Not Contactable"
          value={cardStats.notContactable.length}
          icon={PhoneOff}
          iconBg="bg-slate-100"
          iconColor="text-slate-500"
          onClick={() => navigate(`/employee/leads?status=NOT_CONTACTED&${dateQuery}`)}
        />
        <StatsCard
          label="Lost"
          value={cardStats.lost.length}
          icon={XCircle}
          iconBg="bg-red-100"
          iconColor="text-red-500"
          onClick={() => navigate(`/employee/leads?status=LOST&${dateQuery}`)}
        />
        <StatsCard
          label="Confirmed"
          value={cardStats.confirmed.length}
          icon={CheckCircle}
          iconBg="bg-green-100"
          iconColor="text-green-600"
          onClick={() => navigate(`/employee/leads?status=CONFIRMED&${dateQuery}`)}
        />
      </div>

      {/* Row 2 — Next Follow-up + Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-1 space-y-4">
          {/* Next Follow-up */}
          {stats.nextFollowUp ? (
            <NextFollowUpCard lead={stats.nextFollowUp} onClick={() => openLead(stats.nextFollowUp!.id)} />
          ) : (
            <div className="card p-5 flex flex-col items-center justify-center text-slate-400 py-8">
              <Calendar className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm font-medium">No upcoming follow-ups</p>
              <p className="text-xs mt-1">You're all caught up!</p>
            </div>
          )}

          {/* Today's Follow-ups List */}
          {stats.todayFollowUps.length > 0 && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-orange-500" />
                Today's Follow-ups ({stats.todayFollowUps.length})
              </h3>
              <div className="space-y-2">
                {stats.todayFollowUps.slice(0, 4).map((lead) => (
                  <div
                    key={lead.id}
                    onClick={() => openLead(lead.id)}
                    className="p-2.5 bg-orange-50 border border-orange-100 rounded-xl cursor-pointer hover:bg-orange-100 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800 truncate">{lead.name}</p>
                      <span className="text-xs text-orange-600 font-medium shrink-0">{formatDate(lead.followUpDate)}</span>
                    </div>
                    {lead.followUpNotes && (
                      <p className="text-xs text-slate-500 mt-0.5 truncate italic">"{lead.followUpNotes}"</p>
                    )}
                  </div>
                ))}
                {stats.todayFollowUps.length > 4 && (
                  <button onClick={() => navigate('/employee/follow-ups')} className="w-full text-xs text-primary-600 hover:text-primary-700 font-medium py-1 text-center">
                    +{stats.todayFollowUps.length - 4} more →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Status Distribution */}
        <div className="card p-5 xl:col-span-1">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Status Distribution</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="45%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-slate-400 text-sm">No leads yet</div>
          )}
        </div>

        {/* Quick Actions + Recent confirmed */}
        <div className="xl:col-span-1 space-y-4">
          {/* Quick Actions */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary-500" />
              Quick Status Update
            </h3>
            <div className="space-y-2">
              {leads
                .filter((l) => !['CONFIRMED', 'LOST'].includes(l.status))
                .slice(0, 4)
                .map((lead) => (
                  <div key={lead.id} className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openLead(lead.id)}>
                      <p className="text-sm font-medium text-slate-800 truncate">{lead.name}</p>
                      <Badge status={lead.status} />
                    </div>
                    <button
                      onClick={() => setQuickStatusLead(lead)}
                      className="text-xs px-2.5 py-1 bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors font-medium whitespace-nowrap"
                    >
                      Update
                    </button>
                  </div>
                ))}
              {leads.filter((l) => !['CONFIRMED', 'LOST'].includes(l.status)).length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">All leads are resolved</p>
              )}
            </div>
          </div>

          {/* Confirmed Leads summary */}
          {stats.confirmed.length > 0 && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Your Confirmed ({stats.confirmed.length})
              </h3>
              <div className="space-y-2">
                {stats.confirmed.slice(0, 3).map((lead) => (
                  <div
                    key={lead.id}
                    onClick={() => openLead(lead.id)}
                    className="flex items-center gap-2 p-2.5 rounded-xl bg-green-50 border border-green-100 cursor-pointer hover:bg-green-100 transition-colors"
                  >
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{lead.name}</p>
                      {lead.destination && <p className="text-xs text-slate-500">{lead.destination}</p>}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row 3 — Starred & Recently Viewed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StarredSection
          leads={leads}
          starredIds={starred}
          onToggleStar={toggleStar}
          onOpenLead={openLead}
        />
        <RecentlyViewedSection
          leads={leads}
          viewIds={recentViewIds}
          onOpenLead={openLead}
        />
      </div>

      {/* Row 4 — Overdue */}
      {overdue.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-semibold text-red-700">Overdue Follow-ups ({overdue.length})</h3>
            <button onClick={() => navigate('/employee/follow-ups')} className="ml-auto text-xs text-primary-600 hover:text-primary-700 font-medium">
              View all
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {overdue.slice(0, 6).map((lead) => (
              <LeadCard key={lead.id} lead={lead} onClick={(l) => openLead(l.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Lead Detail Drawer */}
      <LeadDetail
        leadId={selectedLeadId}
        open={!!selectedLeadId}
        onClose={() => setSelectedLeadId(null)}
        isStarred={selectedLeadId ? isStarred(selectedLeadId) : false}
        onToggleStar={selectedLeadId ? () => toggleStar(selectedLeadId) : undefined}
      />

      {/* Quick Status Panel */}
      {quickStatusLead && (
        <QuickStatusPanel lead={quickStatusLead} onClose={() => setQuickStatusLead(null)} />
      )}
    </div>
  );
}
