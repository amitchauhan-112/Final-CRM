import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Map, Calendar, Users2,
} from 'lucide-react';
import { useDeparture, useUpdateDeparture } from '../../hooks/useOperations';
import { Skeleton } from '../../components/ui/Skeleton';
import Tabs, { useUrlTab } from '../../components/ui/Tabs';
import HotelsTab from '../../components/operations/HotelsTab';
import VehiclesTab from '../../components/operations/VehiclesTab';
import TripCaptainTab from '../../components/operations/TripCaptainTab';
import OthersTab from '../../components/operations/OthersTab';
import B2BSaleCard from '../../components/operations/B2BSaleCard';
import { cn } from '../../utils/helpers';

const STATUS_BADGE: Record<string, string> = {
  UPCOMING: 'bg-primary-50 text-primary-700',
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  COMPLETED: 'bg-slate-100 text-slate-600',
  CANCELLED: 'bg-red-50 text-red-600',
};

// Only these 4 tabs are rendered here — Overview/Passengers/Group Summary/
// Timeline/Checklist/Documents/Notes were deliberately dropped from this page
// per an explicit request to show only the operational requirements that need
// action. Their components/routes/backend data are untouched — only unmounted
// from here — so restoring any of them later is a small, low-risk change.
const TABS = [
  { key: 'captain', label: 'Trip Captain' },
  { key: 'hotels', label: 'Hotel Required' },
  { key: 'vehicles', label: 'Vehicle Required' },
  { key: 'others', label: 'Others' },
] as const;
type Tab = (typeof TABS)[number]['key'];

export default function DepartureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const base = location.pathname.startsWith('/admin') ? '/admin/operations' : '/operations';
  const [tab, setTab] = useUrlTab<Tab>(TABS, 'captain');
  const searchParams = new URLSearchParams(location.search);
  const prefillCheckIn = searchParams.get('checkIn') ?? undefined;
  const prefillCheckOut = searchParams.get('checkOut') ?? undefined;
  const prefillLocation = searchParams.get('location') ?? undefined;

  const { data, isLoading } = useDeparture(id);
  const departure = data?.data;

  const updateStatus = useUpdateDeparture(id ?? '');

  if (isLoading || !departure) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(`${base}/departures`)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="w-4 h-4" />Back to Departures
      </button>

      {/* Header */}
      <div className="card p-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary-100 flex items-center justify-center flex-shrink-0">
              <Map className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-slate-900">{departure.destination}</h2>
                <select
                  value={departure.status}
                  disabled={updateStatus.isPending}
                  onChange={(e) => updateStatus.mutate({ status: e.target.value } as any)}
                  title={departure.status === 'UPCOMING' ? 'Starting the trip requires every applicable checklist item to be done first' : undefined}
                  className={cn('badge border-0 cursor-pointer pr-6', STATUS_BADGE[departure.status])}
                >
                  <option value="UPCOMING">UPCOMING</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>
              <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(departure.departureDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                {departure.package && <span>· {departure.package.name}</span>}
              </p>
              <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1">
                <Users2 className="w-3.5 h-3.5" />
                {departure.groupSummary?.totalTravelers ?? 0} travelers · {departure.bookings.length} bookings
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <B2BSaleCard departure={departure} />

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'captain' && <TripCaptainTab departure={departure} />}
      {tab === 'hotels' && <HotelsTab
        departureId={departure.id}
        hotels={departure.hotels}
        roomsRequired={departure.bookings.reduce((sum, b) => {
          const cap = ({ SINGLE: 1, DOUBLE: 2, TRIPLE: 3, QUAD: 4 } as Record<string, number>)[b.roomSharing] ?? 2;
          return sum + Math.ceil(b.numberOfTravelers / cap);
        }, 0)}
        hotelRequirements={departure.hotelRequirements}
        defaultCheckIn={prefillCheckIn}
        defaultCheckOut={prefillCheckOut}
        defaultLocation={prefillLocation}
        autoOpenAdd={!!prefillCheckIn}
      />}
      {tab === 'vehicles' && <VehiclesTab departureId={departure.id} vehicles={departure.vehicles} totalTravelers={departure.groupSummary?.totalTravelers ?? 0} />}
      {tab === 'others' && <OthersTab departureId={departure.id} requirements={departure.requirements} />}
    </div>
  );
}
