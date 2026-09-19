import { useNavigate } from 'react-router-dom';
import { MapPin, Calendar, Users, ChevronRight, Map } from 'lucide-react';
import { useMyTripCaptainDepartures } from '../../hooks/useTripCaptain';
import { Skeleton } from '../../components/ui/Skeleton';
import { cn } from '../../utils/helpers';

const STATUS_BADGE: Record<string, string> = {
  UPCOMING: 'bg-primary-50 text-primary-700',
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  COMPLETED: 'bg-slate-100 text-slate-600',
  CANCELLED: 'bg-red-50 text-red-600',
};

export default function TripCaptainDashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useMyTripCaptainDepartures();
  const departures = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
    );
  }

  if (departures.length === 0) {
    return (
      <div className="empty-state">
        <Map className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="font-semibold text-slate-600">No trips assigned yet</p>
        <p className="text-sm text-slate-400 mt-1">Operations will assign you to a departure — it'll show up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {departures.map((d) => (
        <button
          key={d.id}
          onClick={() => navigate(`/trip-captain/trips/${d.id}`)}
          className="w-full card p-4 flex items-center justify-between gap-3 hover:border-primary-300 transition-colors text-left"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-primary-100 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-5 h-5 text-primary-600" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 truncate">{d.destination}</p>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 flex-wrap">
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(d.departureDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <span className="flex items-center gap-1"><Users className="w-3 h-3" />{d._count.bookings} booking{d._count.bookings !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={cn('badge', STATUS_BADGE[d.status])}>{d.status}</span>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </div>
        </button>
      ))}
    </div>
  );
}
