import {
  IndianRupee, CalendarDays, TrendingUp, Wallet, RotateCcw, CalendarClock,
  PlaneTakeoff, BookOpen, CheckSquare, UserCheck, Building2, Truck,
  Award, MapPin, Megaphone, Users, UserPlus, Repeat, Percent, Gauge, LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useExecutiveDashboard } from '../../hooks/useDashboard';
import StatsCard from '../../components/ui/StatsCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatCurrency } from '../../utils/helpers';

function healthColor(score: number) {
  if (score >= 75) return { text: 'text-emerald-600', bg: 'bg-emerald-50', ring: 'stroke-emerald-500' };
  if (score >= 50) return { text: 'text-amber-600', bg: 'bg-amber-50', ring: 'stroke-amber-500' };
  return { text: 'text-red-600', bg: 'bg-red-50', ring: 'stroke-red-500' };
}

function TopCard({ icon: Icon, label, name, sub }: { icon: LucideIcon; label: string; name: string; sub?: string }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-primary-100 text-primary-600">
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-800 truncate">{name}</p>
        <p className="text-xs text-slate-400">{label}{sub ? ` · ${sub}` : ''}</p>
      </div>
    </div>
  );
}

export default function ExecutiveDashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useExecutiveDashboard();
  const stats = data?.data;

  const financeCards = stats
    ? [
        { label: "Today's Revenue", value: formatCurrency(stats.todaysRevenue), icon: CalendarDays, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', onClick: () => navigate('/admin/finance/reports') },
        { label: 'Monthly Revenue', value: formatCurrency(stats.monthlyRevenue), icon: TrendingUp, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', onClick: () => navigate('/admin/finance/reports') },
        { label: 'Outstanding Amount', value: formatCurrency(stats.outstandingAmount), icon: Wallet, iconBg: 'bg-amber-100', iconColor: 'text-amber-600', onClick: () => navigate('/admin/finance/pending') },
        { label: 'Collections Today', value: formatCurrency(stats.collectionsToday), icon: IndianRupee, iconBg: 'bg-primary-100', iconColor: 'text-primary-600', onClick: () => navigate('/admin/finance/reports') },
        { label: 'Refunds Pending', value: stats.refundsPending, icon: RotateCcw, iconBg: 'bg-red-100', iconColor: 'text-red-600', onClick: () => navigate('/admin/finance/refunds') },
      ]
    : [];

  const opsCards = stats
    ? [
        { label: 'Upcoming Departures', value: stats.upcomingDepartures, icon: CalendarClock, iconBg: 'bg-primary-100', iconColor: 'text-primary-600', onClick: () => navigate('/admin/operations/departures?status=UPCOMING') },
        { label: 'Trips In Progress', value: stats.tripsInProgress, icon: PlaneTakeoff, iconBg: 'bg-primary-100', iconColor: 'text-primary-600', onClick: () => navigate('/admin/operations/departures?status=ACTIVE') },
        { label: 'Active Bookings', value: stats.activeBookings, icon: BookOpen, iconBg: 'bg-primary-100', iconColor: 'text-primary-600', onClick: () => navigate('/admin/bookings') },
        { label: 'Pending Payments', value: stats.pendingPayments, icon: CheckSquare, iconBg: 'bg-amber-100', iconColor: 'text-amber-600', onClick: () => navigate('/admin/finance/verification') },
        { label: 'Pending Traveller Verification', value: stats.pendingTravelerVerification, icon: UserCheck, iconBg: 'bg-amber-100', iconColor: 'text-amber-600', onClick: () => navigate('/admin/operations/departures') },
        { label: 'Pending Hotel Confirmation', value: stats.pendingHotelConfirmation, icon: Building2, iconBg: 'bg-amber-100', iconColor: 'text-amber-600', onClick: () => navigate('/admin/operations/departures') },
        { label: 'Pending Vehicle Confirmation', value: stats.pendingVehicleConfirmation, icon: Truck, iconBg: 'bg-amber-100', iconColor: 'text-amber-600', onClick: () => navigate('/admin/operations/departures') },
      ]
    : [];

  const customerCards = stats
    ? [
        { label: 'Total Customers', value: stats.totalCustomers, icon: Users, iconBg: 'bg-slate-100', iconColor: 'text-slate-600', onClick: () => navigate('/admin/customers') },
        { label: 'New Customers This Month', value: stats.newCustomersThisMonth, icon: UserPlus, iconBg: 'bg-slate-100', iconColor: 'text-slate-600', onClick: () => navigate('/admin/customers') },
        { label: 'Customer Retention', value: `${stats.customerRetentionPct}%`, icon: Repeat, iconBg: 'bg-slate-100', iconColor: 'text-slate-600', onClick: () => navigate('/admin/customers') },
        { label: 'Conversion Rate', value: `${stats.conversionRatePct}%`, icon: Percent, iconBg: 'bg-slate-100', iconColor: 'text-slate-600', onClick: () => navigate('/admin/leads') },
      ]
    : [];

  const health = stats ? healthColor(stats.businessHealthScore) : healthColor(0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Executive Dashboard</h2>
        <p className="text-sm text-slate-500 mt-0.5">The control center — revenue, operations, and business health at a glance</p>
      </div>

      {isLoading || !stats ? (
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-2xl" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
          </div>
        </div>
      ) : (
        <>
          {/* Business Health Score — the one number an owner checks first */}
          <div className="card p-5 flex flex-col sm:flex-row items-center gap-5">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center flex-shrink-0 ${health.bg}`}>
              <div className="text-center">
                <p className={`text-3xl font-black ${health.text}`}>{stats.businessHealthScore}</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">/ 100</p>
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Gauge className={`w-4 h-4 ${health.text}`} />
                <h3 className="font-bold text-slate-800">Overall Business Health Score</h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Average of collection rate, trip readiness, on-time departure readiness, and lead conversion</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                <div><p className="text-xs text-slate-400">Collection Rate</p><p className="text-sm font-semibold text-slate-700">{stats.businessHealthBreakdown.collectionRatePct}%</p></div>
                <div><p className="text-xs text-slate-400">Trip Readiness</p><p className="text-sm font-semibold text-slate-700">{stats.businessHealthBreakdown.checklistProgressAvg}%</p></div>
                <div><p className="text-xs text-slate-400">On-Time Readiness</p><p className="text-sm font-semibold text-slate-700">{stats.businessHealthBreakdown.onTimeReadinessPct}%</p></div>
                <div><p className="text-xs text-slate-400">Lead Conversion</p><p className="text-sm font-semibold text-slate-700">{stats.businessHealthBreakdown.conversionRatePct}%</p></div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-600 mb-3">Finance</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {financeCards.map((c) => <StatsCard key={c.label} label={c.label} value={c.value} icon={c.icon} iconBg={c.iconBg} iconColor={c.iconColor} onClick={c.onClick} />)}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-600 mb-3">Operations</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {opsCards.map((c) => <StatsCard key={c.label} label={c.label} value={c.value} icon={c.icon} iconBg={c.iconBg} iconColor={c.iconColor} onClick={c.onClick} />)}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-600 mb-3">Top Performers</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <TopCard icon={Award} label="Top Selling Package" name={stats.topSellingPackage?.name ?? 'No bookings yet'} sub={stats.topSellingPackage ? formatCurrency(stats.topSellingPackage.revenue) : undefined} />
              <TopCard icon={MapPin} label="Top Destination" name={stats.topDestination?.destination ?? 'No bookings yet'} sub={stats.topDestination ? formatCurrency(stats.topDestination.revenue) : undefined} />
              <TopCard icon={Megaphone} label="Top Campaign" name={stats.topCampaign?.name ?? 'No attributed bookings'} sub={stats.topCampaign ? formatCurrency(stats.topCampaign.revenue) : undefined} />
              <TopCard icon={UserCheck} label="Top Employee" name={stats.topEmployee?.name ?? 'No bookings yet'} sub={stats.topEmployee ? formatCurrency(stats.topEmployee.revenue) : undefined} />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-600 mb-3">Customers</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {customerCards.map((c) => <StatsCard key={c.label} label={c.label} value={c.value} icon={c.icon} iconBg={c.iconBg} iconColor={c.iconColor} onClick={c.onClick} />)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
