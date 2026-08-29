import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Map, CalendarDays, Users, BedDouble, Truck, ChevronDown, ChevronUp,
  Package, ArrowLeft, RefreshCw,
} from 'lucide-react';
import { useStayPlan } from '../../hooks/useOperations';
import { Skeleton } from '../../components/ui/Skeleton';
import { cn } from '../../utils/helpers';
import type { StayPlanEntry } from '../../types/index';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

// ─── Room Summary Strip ───────────────────────────────────────────────────────

function RoomSummary({ rooms }: { rooms: StayPlanEntry['rooms'] }) {
  const items = [
    { label: 'Single', value: rooms.SINGLE, color: 'text-primary-600' },
    { label: 'Double', value: rooms.DOUBLE, color: 'text-emerald-600' },
    { label: 'Triple', value: rooms.TRIPLE, color: 'text-amber-600' },
    { label: 'Quad', value: rooms.QUAD, color: 'text-violet-600' },
  ].filter((r) => r.value > 0);

  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rooms:</span>
      {items.map((r) => (
        <span key={r.label} className={cn('text-xs font-semibold', r.color)}>
          {r.label} × {r.value}
        </span>
      ))}
      <span className="text-xs font-bold text-slate-600 ml-1">= {rooms.total} total</span>
    </div>
  );
}

// ─── Vehicle Summary Strip ────────────────────────────────────────────────────

function VehicleSummary({ vehicles }: { vehicles: StayPlanEntry['vehicles'] }) {
  if (vehicles.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vehicles:</span>
      {vehicles.map((v, i) => (
        <span key={i} className="text-xs font-semibold text-slate-600">
          {v.count} × {v.type}
        </span>
      ))}
    </div>
  );
}

// ─── Destination Card (single dest on a date) ─────────────────────────────────

function DestinationCard({ date, entry, onNavigate }: { date: string; entry: StayPlanEntry; onNavigate: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Map className="w-3.5 h-3.5 text-primary-500 flex-shrink-0" />
            <span className="font-semibold text-slate-800 text-sm">{entry.destination}</span>
            {entry.nights > 1 && (
              <span className="text-[10px] font-bold bg-primary-50 text-primary-600 px-1.5 py-0.5 rounded-full flex-shrink-0">
                {entry.nights} nights · {formatDate(date)} → {formatDate(entry.checkOutDate)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{entry.guestCount} guests</span>
            <span className="flex items-center gap-1"><BedDouble className="w-3 h-3" />{entry.rooms.total} rooms</span>
            {entry.vehicles.length > 0 && (
              <span className="flex items-center gap-1"><Truck className="w-3 h-3" />{entry.vehicles.reduce((s, v) => s + v.count, 0)} vehicles</span>
            )}
          </div>
          <RoomSummary rooms={entry.rooms} />
          <VehicleSummary vehicles={entry.vehicles} />
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0 mt-0.5"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && entry.breakdown.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Rooms needed, by package (highest first)
          </p>
          {entry.breakdown.map((pkg, i) => (
            <button
              key={pkg.packageId || i}
              onClick={() => pkg.departureIds[0] && onNavigate(pkg.departureIds[0])}
              className="w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors text-xs"
            >
              <span className="flex items-center gap-2 min-w-0">
                <Package className="w-3 h-3 text-slate-400 flex-shrink-0" />
                <span className="text-slate-700 font-medium truncate">{pkg.packageName}</span>
              </span>
              <span className="flex-shrink-0 font-semibold text-slate-600">
                {pkg.nights > 1 && <span className="text-slate-400 font-normal mr-1">{pkg.nights}N ·</span>}
                {pkg.rooms.total} room{pkg.rooms.total !== 1 ? 's' : ''}
                <span className="text-slate-400 font-normal"> · {pkg.guestCount} guests</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Date-wise View ───────────────────────────────────────────────────────────

function DateWiseView() {
  const navigate = useNavigate();
  const location = useLocation();
  const base = location.pathname.startsWith('/admin') ? '/admin/operations' : '/operations';
  const { data, isLoading } = useStayPlan();
  const plan = data?.data;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
      </div>
    );
  }

  const dateWise = plan?.dateWise ?? [];
  if (dateWise.length === 0) {
    return (
      <div className="empty-state">
        <Map className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="font-semibold text-slate-600">No upcoming stays planned</p>
        <p className="text-sm text-slate-400 mt-1">Stay data appears automatically from confirmed bookings</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {dateWise.map(({ date, entries }) => {
        const totalGuests = entries.reduce((s, e) => s + e.guestCount, 0);
        const totalRooms = entries.reduce((s, e) => s + e.rooms.total, 0);
        return (
          <div key={date}>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-primary-500" />
                <h3 className="font-bold text-slate-800 text-sm">{formatDate(date)}</h3>
              </div>
              <span className="text-xs text-slate-400">
                {entries.length} {entries.length === 1 ? 'destination' : 'destinations'} · {totalGuests} guests · {totalRooms} rooms
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {entries.map((entry) => (
                <DestinationCard
                  key={entry.destination}
                  date={date}
                  entry={entry}
                  onNavigate={(id) => navigate(`${base}/departures/${id}`)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Package-wise View ────────────────────────────────────────────────────────

function PackageWiseView() {
  const { data, isLoading } = useStayPlan();
  const plan = data?.data;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
      </div>
    );
  }

  const packageWise = plan?.packageWise ?? [];
  if (packageWise.length === 0) {
    return (
      <div className="empty-state">
        <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="font-semibold text-slate-600">No packages with upcoming stays</p>
        <p className="text-sm text-slate-400 mt-1">Data auto-populates from confirmed bookings</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {packageWise.map((pkg) => (
        <div key={pkg.packageId} className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-4 h-4 text-primary-500" />
            <h3 className="font-bold text-slate-800 text-sm">{pkg.packageName}</h3>
            <span className="text-[10px] font-bold bg-primary-50 text-primary-600 px-2 py-0.5 rounded-full">
              {pkg.dates.length} night{pkg.dates.length !== 1 ? 's' : ''} planned
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-1.5 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date</th>
                  <th className="text-left py-1.5 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Destination</th>
                  <th className="text-right py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Guests</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pkg.dates.map((d, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2 pr-4 font-medium text-slate-700 whitespace-nowrap">{formatDate(d.date)}</td>
                    <td className="py-2 pr-4 text-slate-600">
                      <span className="flex items-center gap-1.5">
                        <Map className="w-3 h-3 text-slate-400 flex-shrink-0" />
                        {d.destination}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                        <Users className="w-3 h-3 text-slate-400" />{d.guestCount}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type ViewMode = 'date' | 'package';

export default function StayPlanningPage() {
  const [view, setView] = useState<ViewMode>('date');
  const navigate = useNavigate();
  const location = useLocation();
  const base = location.pathname.startsWith('/admin') ? '/admin/operations' : '/operations';
  const { refetch, isFetching } = useStayPlan();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`${base}/dashboard`)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Stay Planning</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Auto-calculated from confirmed bookings — dates, rooms, and vehicles
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} disabled={isFetching} className="btn-secondary text-sm gap-2">
            <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
            Refresh
          </button>
          <div className="flex rounded-xl border border-slate-200 overflow-hidden text-sm font-medium">
            <button
              onClick={() => setView('date')}
              className={cn('px-4 py-2 transition-colors', view === 'date' ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}
            >
              <CalendarDays className="w-3.5 h-3.5 inline mr-1.5" />Date-wise
            </button>
            <button
              onClick={() => setView('package')}
              className={cn('px-4 py-2 transition-colors', view === 'package' ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}
            >
              <Package className="w-3.5 h-3.5 inline mr-1.5" />Package-wise
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 px-4 py-3 bg-primary-50 border border-primary-100 rounded-xl text-sm text-primary-700">
        <Map className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>
          All data is computed automatically from Sales bookings. Rooms are calculated from booking room-sharing preferences.
          Vehicle recommendations are based on total passenger count per destination per date.
        </span>
      </div>

      {view === 'date' ? <DateWiseView /> : <PackageWiseView />}
    </div>
  );
}
