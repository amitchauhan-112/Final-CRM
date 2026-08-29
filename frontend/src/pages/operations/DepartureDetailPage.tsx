import { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  ArrowLeft, Map, Calendar, Users2, UserCog, Pencil, Phone,
} from 'lucide-react';
import { useDeparture, useUpdateDeparture } from '../../hooks/useOperations';
import { Skeleton } from '../../components/ui/Skeleton';
import Modal from '../../components/ui/Modal';
import Tabs, { useUrlTab } from '../../components/ui/Tabs';
import TripOverviewTab from '../../components/operations/TripOverviewTab';
import PassengerTable from '../../components/operations/PassengerTable';
import GroupSummaryGrid from '../../components/operations/GroupSummaryGrid';
import TripProfitabilityCard from '../../components/operations/TripProfitabilityCard';
import HotelsTab from '../../components/operations/HotelsTab';
import VehiclesTab from '../../components/operations/VehiclesTab';
import TimelineTab from '../../components/operations/TimelineTab';
import ChecklistTab from '../../components/operations/ChecklistTab';
import DocumentsTab from '../../components/operations/DocumentsTab';
import NotesTab from '../../components/operations/NotesTab';
import { cn } from '../../utils/helpers';

const STATUS_BADGE: Record<string, string> = {
  UPCOMING: 'bg-primary-50 text-primary-700',
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  COMPLETED: 'bg-slate-100 text-slate-600',
  CANCELLED: 'bg-red-50 text-red-600',
};

const CAPTAIN_STATUS_BADGE: Record<string, string> = {
  UNASSIGNED: 'bg-red-50 text-red-600',
  ASSIGNED: 'bg-amber-50 text-amber-700',
  CONFIRMED: 'bg-emerald-50 text-emerald-700',
};

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'passengers', label: 'Passengers' },
  { key: 'summary', label: 'Group Summary' },
  { key: 'hotels', label: 'Hotels' },
  { key: 'vehicles', label: 'Vehicles' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'documents', label: 'Documents' },
  { key: 'notes', label: 'Notes' },
] as const;
type Tab = (typeof TABS)[number]['key'];

interface CaptainForm { tripCaptainName?: string; tripCaptainPhone?: string; tripCaptainStatus: string; }

function TripCaptainModal({ open, onClose, departure }: { open: boolean; onClose: () => void; departure: NonNullable<ReturnType<typeof useDeparture>['data']>['data'] }) {
  const update = useUpdateDeparture(departure.id);
  const { register, handleSubmit } = useForm<CaptainForm>({
    defaultValues: {
      tripCaptainName: departure.tripCaptainName ?? '',
      tripCaptainPhone: departure.tripCaptainPhone ?? '',
      tripCaptainStatus: departure.tripCaptainStatus,
    },
  });

  const onSubmit = (data: CaptainForm) => update.mutate(data as any, { onSuccess: onClose });

  return (
    <Modal
      open={open} onClose={onClose} title="Assign Trip Captain" size="sm"
      footer={<>
        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        <button form="captain-form" type="submit" disabled={update.isPending} className="btn-primary">{update.isPending ? 'Saving…' : 'Save'}</button>
      </>}
    >
      <form id="captain-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="label">Trip Captain Name</label>
          <input {...register('tripCaptainName')} className="input" />
        </div>
        <div>
          <label className="label">Contact Number</label>
          <input {...register('tripCaptainPhone')} className="input" />
        </div>
        <div>
          <label className="label">Status</label>
          <select {...register('tripCaptainStatus')} className="input">
            <option value="UNASSIGNED">Unassigned</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="CONFIRMED">Confirmed</option>
          </select>
        </div>
      </form>
    </Modal>
  );
}

export default function DepartureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const base = location.pathname.startsWith('/admin') ? '/admin/operations' : '/operations';
  const [tab, setTab] = useUrlTab<Tab>(TABS, 'overview');
  const [captainModalOpen, setCaptainModalOpen] = useState(false);
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

          <div className="text-right">
            <button
              onClick={() => setCaptainModalOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 hover:border-primary-300 transition-colors"
            >
              <UserCog className="w-4 h-4 text-slate-400" />
              <div className="text-left">
                <p className="text-xs text-slate-400">Trip Captain</p>
                <p className="text-sm font-medium text-slate-700">
                  {departure.tripCaptainName || 'Not assigned'}
                  {departure.tripCaptainPhone && <span className="text-slate-400 font-normal"> · <Phone className="w-3 h-3 inline" /> {departure.tripCaptainPhone}</span>}
                </p>
              </div>
              <span className={cn('badge', CAPTAIN_STATUS_BADGE[departure.tripCaptainStatus])}>{departure.tripCaptainStatus}</span>
              <Pencil className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && <TripOverviewTab departure={departure} onChangeTab={(t) => setTab(t as Tab)} />}
      {tab === 'passengers' && <PassengerTable departure={departure} />}
      {tab === 'summary' && departure.groupSummary && (
        <div className="space-y-4">
          {departure.tripProfitability && <TripProfitabilityCard profitability={departure.tripProfitability} />}
          <GroupSummaryGrid summary={departure.groupSummary} />
        </div>
      )}
      {tab === 'hotels' && <HotelsTab
        departureId={departure.id}
        hotels={departure.hotels}
        roomsRequired={departure.bookings.reduce((sum, b) => {
          const cap = ({ SINGLE: 1, DOUBLE: 2, TRIPLE: 3, QUAD: 4 } as Record<string, number>)[b.roomSharing] ?? 2;
          return sum + Math.ceil(b.numberOfTravelers / cap);
        }, 0)}
        defaultCheckIn={prefillCheckIn}
        defaultCheckOut={prefillCheckOut}
        defaultLocation={prefillLocation}
        autoOpenAdd={!!prefillCheckIn}
      />}
      {tab === 'vehicles' && <VehiclesTab departureId={departure.id} vehicles={departure.vehicles} totalTravelers={departure.groupSummary?.totalTravelers ?? 0} />}
      {tab === 'timeline' && <TimelineTab departureId={departure.id} timeline={departure.timeline} departureDate={departure.departureDate} />}
      {tab === 'checklist' && <ChecklistTab departureId={departure.id} checklist={departure.checklist} />}
      {tab === 'documents' && <DocumentsTab departureId={departure.id} documents={departure.documents} />}
      {tab === 'notes' && <NotesTab departureId={departure.id} notes={departure.notes} />}

      <TripCaptainModal open={captainModalOpen} onClose={() => setCaptainModalOpen(false)} departure={departure} />
    </div>
  );
}
