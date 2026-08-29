import { useNavigate, useLocation } from 'react-router-dom';
import {
  CalendarDays, CalendarClock, Plane, CheckCircle2, Users, Building2,
  Truck, BedDouble, UserCog, LogIn, LogOut, ArrowRightLeft, ListChecks,
  Users2, Truck as TruckIcon, ArrowRight, ShieldCheck, ClipboardCheck, PartyPopper,
  Map, CheckSquare,
} from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useOpsDashboard } from '../../hooks/useOperations';
import StatsCard from '../../components/ui/StatsCard';
import { Skeleton } from '../../components/ui/Skeleton';
import TravelCalendarWidget from '../../components/operations/TravelCalendarWidget';

const PENDING_COLORS = ['#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444'];

export default function OperationsDashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const base = location.pathname.startsWith('/admin') ? '/admin/operations' : '/operations';
  const { data, isLoading } = useOpsDashboard();
  const stats = data?.data;

  const departuresOverview = stats
    ? [
        { name: 'Today', count: stats.todaysDepartures },
        { name: 'Upcoming', count: stats.upcomingDepartures },
        { name: 'Active', count: stats.activeTrips },
        { name: 'Completed', count: stats.completedTrips },
      ]
    : [];

  const pendingBreakdown = stats
    ? [
        { name: 'Hotels', value: stats.pendingHotelBookings },
        { name: 'Vehicles', value: stats.pendingVehicleBookings },
        { name: 'Room Allocation', value: stats.pendingRoomAllocation },
        { name: 'Trip Captain', value: stats.pendingTripCaptainAssignment },
      ].filter((d) => d.value > 0)
    : [];

  const tripStatusCards = stats
    ? [
        { label: "Today's Departures", value: stats.todaysDepartures, icon: CalendarDays, iconBg: 'bg-primary-100', iconColor: 'text-primary-600', onClick: () => navigate(`${base}/departures`) },
        { label: 'Upcoming Departures', value: stats.upcomingDepartures, icon: CalendarClock, iconBg: 'bg-primary-100', iconColor: 'text-primary-600', onClick: () => navigate(`${base}/departures?status=UPCOMING`) },
        { label: 'Active Trips', value: stats.activeTrips, icon: Plane, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', onClick: () => navigate(`${base}/departures?status=ACTIVE`) },
        { label: 'Completed Trips', value: stats.completedTrips, icon: CheckCircle2, iconBg: 'bg-slate-100', iconColor: 'text-slate-600', onClick: () => navigate(`${base}/departures?status=COMPLETED`) },
      ]
    : [];

  const todaysOpsCards = stats
    ? [
        { label: 'Total Travelers Today', value: stats.totalTravelersToday, icon: Users, iconBg: 'bg-primary-100', iconColor: 'text-primary-600', onClick: () => navigate(`${base}/departures`) },
        { label: "Today's Check-ins", value: stats.todaysCheckins, icon: LogIn, iconBg: 'bg-mountain-100', iconColor: 'text-mountain-600', onClick: () => navigate(`${base}/departures`) },
        { label: "Today's Check-outs", value: stats.todaysCheckouts, icon: LogOut, iconBg: 'bg-mountain-100', iconColor: 'text-mountain-600', onClick: () => navigate(`${base}/departures`) },
        { label: "Today's Transfers", value: stats.todaysTransfers, icon: ArrowRightLeft, iconBg: 'bg-mountain-100', iconColor: 'text-mountain-600', onClick: () => navigate(`${base}/departures`) },
      ]
    : [];

  const hotelCards = stats
    ? [
        { label: 'Hotels Booked', value: stats.bookedHotelBookings, icon: CheckSquare, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', onClick: () => navigate(`${base}/departures`) },
        { label: 'Hotels Pending', value: stats.pendingHotelBookings, icon: Building2, iconBg: 'bg-amber-100', iconColor: 'text-amber-600', onClick: () => navigate(`${base}/departures`) },
        { label: 'Vehicles Booked', value: stats.bookedVehicleBookings, icon: CheckSquare, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', onClick: () => navigate(`${base}/departures`) },
        { label: 'Vehicles Pending', value: stats.pendingVehicleBookings, icon: Truck, iconBg: 'bg-amber-100', iconColor: 'text-amber-600', onClick: () => navigate(`${base}/departures`) },
      ]
    : [];

  const captainCards = stats
    ? [
        { label: 'Trip Captains Assigned', value: stats.assignedTripCaptains, icon: CheckSquare, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', onClick: () => navigate(`${base}/departures`) },
        { label: 'Trip Captains Pending', value: stats.pendingTripCaptainAssignment, icon: UserCog, iconBg: 'bg-amber-100', iconColor: 'text-amber-600', onClick: () => navigate(`${base}/departures`) },
      ]
    : [];

  const pendingActionCards = (stats
    ? [
        { label: 'Pending Room Allocation', value: stats.pendingRoomAllocation, icon: BedDouble, iconBg: 'bg-amber-100', iconColor: 'text-amber-600', onClick: () => navigate(`${base}/departures`) },
        { label: 'Pending Traveler Verification', value: stats.pendingTravelerVerification, icon: ShieldCheck, iconBg: 'bg-amber-100', iconColor: 'text-amber-600', onClick: () => navigate(`${base}/departures`) },
      ]
    : []
  ).filter((c) => c.value > 0);

  const overviewCards = stats
    ? [
        { label: 'Total Travelers on Tour', value: stats.totalTravelersOnTour, icon: Users2, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', onClick: () => navigate(`${base}/departures?status=ACTIVE`) },
        { label: 'Upcoming Activities', value: stats.upcomingActivities, icon: ListChecks, iconBg: 'bg-primary-100', iconColor: 'text-primary-600', onClick: () => navigate(`${base}/departures?status=UPCOMING`) },
        { label: 'Avg. Checklist Progress', value: `${stats.checklistProgressAvg}%`, icon: ClipboardCheck, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', onClick: () => navigate(`${base}/departures`) },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Operations Dashboard</h2>
          <p className="text-sm text-slate-500 mt-0.5">Live view of every trip currently in motion</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(`${base}/stay-plan`)} className="btn-secondary text-sm">
            <Map className="w-4 h-4" />
            Stay Planning
          </button>
          <button onClick={() => navigate(`${base}/departures`)} className="btn-secondary text-sm">
            View All Departures
          </button>
          <button onClick={() => navigate(`${base}/vendors`)} className="btn-secondary text-sm">
            <TruckIcon className="w-4 h-4" />
            Vendors
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : (
        <>
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Trip Status</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {tripStatusCards.map((c) => (
                <StatsCard key={c.label} label={c.label} value={c.value} icon={c.icon} iconBg={c.iconBg} iconColor={c.iconColor} onClick={c.onClick} />
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Today's Operations</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {todaysOpsCards.map((c) => (
                <StatsCard key={c.label} label={c.label} value={c.value} icon={c.icon} iconBg={c.iconBg} iconColor={c.iconColor} onClick={c.onClick} />
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Hotels & Vehicles</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {hotelCards.map((c) => (
                <StatsCard key={c.label} label={c.label} value={c.value} icon={c.icon} iconBg={c.iconBg} iconColor={c.iconColor} onClick={c.onClick} />
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Trip Captains</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {captainCards.map((c) => (
                <StatsCard key={c.label} label={c.label} value={c.value} icon={c.icon} iconBg={c.iconBg} iconColor={c.iconColor} onClick={c.onClick} />
              ))}
            </div>
          </div>

          {pendingActionCards.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Other Pending Actions</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {pendingActionCards.map((c) => (
                  <StatsCard key={c.label} label={c.label} value={c.value} icon={c.icon} iconBg={c.iconBg} iconColor={c.iconColor} onClick={c.onClick} />
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Overview</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {overviewCards.map((c) => (
                <StatsCard key={c.label} label={c.label} value={c.value} icon={c.icon} iconBg={c.iconBg} iconColor={c.iconColor} onClick={c.onClick} />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TravelCalendarWidget />
            <div className="card p-5">
              <h3 className="font-semibold text-slate-800 mb-4 text-sm">Departures Overview</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={departuresOverview} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card p-5">
              <h3 className="font-semibold text-slate-800 mb-4 text-sm">Pending Items Breakdown</h3>
              {pendingBreakdown.length === 0 ? (
                <div className="h-[220px] flex items-center justify-center text-sm text-slate-400 flex-col gap-2">
                  <PartyPopper className="w-8 h-8 text-emerald-400" />
                  Nothing pending — all caught up
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pendingBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {pendingBreakdown.map((_, idx) => (
                        <Cell key={idx} fill={PENDING_COLORS[idx % PENDING_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-slate-800 mb-4 text-sm">Quick Actions</h3>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => navigate(`${base}/stay-plan`)} className="btn-secondary text-sm">
                <Map className="w-4 h-4" />
                Stay Planning
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => navigate(`${base}/departures?status=UPCOMING`)} className="btn-secondary text-sm">
                <CalendarClock className="w-4 h-4" />
                Upcoming Departures
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => navigate(`${base}/departures?status=ACTIVE`)} className="btn-secondary text-sm">
                <Plane className="w-4 h-4" />
                Active Trips
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => navigate(`${base}/vendors`)} className="btn-secondary text-sm">
                <TruckIcon className="w-4 h-4" />
                Manage Vendors
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
