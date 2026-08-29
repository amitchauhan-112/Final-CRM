import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  CalendarDays, MapPin, Users, BedDouble, ChevronDown, ChevronUp,
  ArrowLeft, RefreshCw, CheckCircle2, AlertTriangle, Clock, Building2, User,
} from 'lucide-react';
import { useRoomsRequired } from '../../hooks/useOperations';
import { Skeleton } from '../../components/ui/Skeleton';
import { cn } from '../../utils/helpers';
import type { RoomsRequiredEntry, RoomRequirementStatus } from '../../types/index';

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

// ─── Status badge ──────────────────────────────────────────────────────────

const STATUS_CFG: Record<RoomRequirementStatus, { label: string; dot: string; bg: string; text: string; icon: typeof CheckCircle2 }> = {
  PENDING:          { label: 'Pending',          dot: 'bg-red-500',     bg: 'bg-red-50',     text: 'text-red-700',     icon: AlertTriangle },
  PARTIALLY_BOOKED: { label: 'Partially Booked',  dot: 'bg-amber-500',   bg: 'bg-amber-50',   text: 'text-amber-700',   icon: Clock },
  FULLY_BOOKED:     { label: 'Fully Booked',      dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', icon: CheckCircle2 },
  OVERBOOKED:       { label: 'Overbooked',        dot: 'bg-violet-500',  bg: 'bg-violet-50',  text: 'text-violet-700',  icon: AlertTriangle },
};

function StatusBadge({ status }: { status: RoomRequirementStatus }) {
  const cfg = STATUS_CFG[status];
  const Icon = cfg.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold', cfg.bg, cfg.text)}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

// ─── Location row (date → location → required/booked/pending/status) ──────

function LocationRow({ date, entry, onManageHotels }: {
  date: string;
  entry: RoomsRequiredEntry;
  onManageHotels: (departureId: string, checkIn: string, checkOut: string, location: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <MapPin className="w-4 h-4 text-primary-500 flex-shrink-0" />
          <span className="font-semibold text-slate-800 text-sm truncate">{entry.destination}</span>
          {entry.nights > 1 && (
            <span className="text-[10px] font-bold bg-primary-50 text-primary-600 px-1.5 py-0.5 rounded-full flex-shrink-0">
              {entry.nights}N · {formatDate(date)} → {formatDate(entry.checkOutDate)}
            </span>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 flex-shrink-0">
          <Users className="w-3.5 h-3.5" />{entry.guestCount}
        </div>
        <div className="text-center flex-shrink-0 w-20">
          <p className="text-sm font-bold text-slate-800">{entry.rooms.total}</p>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">Required</p>
        </div>
        <div className="text-center flex-shrink-0 w-20">
          <p className="text-sm font-bold text-emerald-600">{entry.roomsBooked}</p>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">Booked</p>
        </div>
        <div className="text-center flex-shrink-0 w-20">
          <p className={cn('text-sm font-bold', entry.roomsPending > 0 ? 'text-red-600' : 'text-slate-400')}>{entry.roomsPending}</p>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">Pending</p>
        </div>
        <div className="flex-shrink-0"><StatusBadge status={entry.status} /></div>
        <div className="flex-shrink-0 text-slate-400">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 p-4 space-y-3 bg-slate-50/50">
          {entry.breakdown.map((pkg) => (
            <div key={pkg.packageId || pkg.packageName} className="bg-white rounded-xl border border-slate-200 p-3.5">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-slate-800 text-sm truncate">{pkg.packageName}</span>
                  {pkg.packageType && (
                    <span className={cn(
                      'text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0',
                      pkg.packageType === 'GIT' ? 'bg-primary-100 text-primary-700' : 'bg-mountain-100 text-mountain-700'
                    )}>
                      {pkg.packageType}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 flex-shrink-0">
                  <span>{pkg.guestCount} guests</span>
                  {pkg.nights > 1 && <span>{pkg.nights} nights</span>}
                  <span className="font-semibold text-slate-700">{pkg.rooms.total} rooms</span>
                  {pkg.departureIds[0] && (
                    <button
                      onClick={() => onManageHotels(pkg.departureIds[0], date, pkg.checkOutDate, entry.destination)}
                      className="btn-secondary text-xs py-1 px-2.5 gap-1"
                    >
                      <Building2 className="w-3 h-3" />Manage Hotels
                    </button>
                  )}
                </div>
              </div>
              <div className="divide-y divide-slate-50">
                {pkg.bookings.map((b) => (
                  <div key={b.bookingId} className="py-2 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-700 truncate">
                        {b.travelerName}
                        {b.bookingNumber && <span className="ml-1.5 text-slate-400 font-mono">({b.bookingNumber})</span>}
                      </p>
                      {b.specialRequest && <p className="text-slate-400 truncate mt-0.5">Note: {b.specialRequest}</p>}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 text-slate-500">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{b.numberOfTravelers}</span>
                      <span>{b.roomSharing}</span>
                      {b.salesExecutive && (
                        <span className="flex items-center gap-1 text-slate-400">
                          <User className="w-3 h-3" />{b.salesExecutive.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function RoomsRequiredPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const base = location.pathname.startsWith('/admin') ? '/admin/operations' : '/operations';
  const { data, isLoading, refetch, isFetching } = useRoomsRequired();

  const dateWise = data?.data.dateWise ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`${base}/dashboard`)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Rooms Required</h2>
            <p className="text-sm text-slate-500 mt-0.5">Date → location → required, booked, pending — at a glance</p>
          </div>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} className="btn-secondary text-sm gap-2">
          <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : dateWise.length === 0 ? (
        <div className="empty-state">
          <BedDouble className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-600">No upcoming room requirements</p>
          <p className="text-sm text-slate-400 mt-1">This fills in automatically from confirmed bookings and package itineraries</p>
        </div>
      ) : (
        <div className="space-y-6">
          {dateWise.map(({ date, entries }) => {
            const totalRequired = entries.reduce((s, e) => s + e.rooms.total, 0);
            const totalBooked = entries.reduce((s, e) => s + e.roomsBooked, 0);
            const totalPending = entries.reduce((s, e) => s + e.roomsPending, 0);
            return (
              <div key={date}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-primary-500" />
                    <h3 className="font-bold text-slate-800 text-sm">{formatDate(date)}</h3>
                  </div>
                  <span className="text-xs text-slate-400">
                    {entries.length} {entries.length === 1 ? 'location' : 'locations'} · {totalRequired} required · {totalBooked} booked
                    {totalPending > 0 && <span className="text-red-500 font-medium"> · {totalPending} pending</span>}
                  </span>
                </div>
                <div className="space-y-2">
                  {entries.map((entry) => (
                    <LocationRow
                      key={entry.destination}
                      date={date}
                      entry={entry}
                      onManageHotels={(depId, checkIn, checkOut, loc) =>
                        navigate(`${base}/departures/${depId}?tab=hotels&checkIn=${checkIn}&checkOut=${checkOut}&location=${encodeURIComponent(loc)}`)
                      }
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
