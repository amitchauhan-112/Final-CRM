import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Building2, Plus, Pencil, Trash2, MapPin, Phone, User, IndianRupee, FileCheck, Wand2, BedDouble, Info, CalendarDays, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useCreateHotel, useUpdateHotel, useDeleteHotel, useRoomAllocationSuggestion } from '../../hooks/useOperations';
import { useVendorAllocation } from '../../hooks/useVendorAllocation';
import { VendorAllocationFields, VendorDivergenceConfirm } from './VendorAllocationFields';
import { Hotel, HotelRequirementBlock } from '../../types/index';
import Modal from '../ui/Modal';
import { formatDate, formatRelativeTime, cn } from '../../utils/helpers';

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  CONFIRMED: 'bg-emerald-50 text-emerald-700',
  CANCELLED: 'bg-red-50 text-red-600',
};

const ROOM_PLAN_OPTIONS: { value: 'MAP' | 'CP' | 'EP'; label: string }[] = [
  { value: 'MAP', label: 'MAP — room + breakfast + 1 meal' },
  { value: 'CP', label: 'CP — room + breakfast' },
  { value: 'EP', label: 'EP — room only' },
];

interface HotelForm {
  name: string; location?: string; checkInDate?: string; checkOutDate?: string;
  numberOfRooms?: number; roomPlan?: string; roomAllocation?: string;
  totalRate?: number;
  confirmationNumber?: string; status: string;
}

type HotelSubmitData = HotelForm & { vendorId?: string; vendorName?: string; vendorContact?: string; contactPerson?: string; rate?: number; advanceRequired?: number };

function HotelFormModal({ open, onClose, defaultValues, onSubmit, isLoading }: {
  open: boolean; onClose: () => void; defaultValues?: Partial<Hotel>;
  onSubmit: (data: HotelSubmitData) => void; isLoading: boolean;
}) {
  const { register, handleSubmit } = useForm<HotelForm>({
    defaultValues: {
      name: defaultValues?.name ?? '',
      location: defaultValues?.location ?? '',
      checkInDate: defaultValues?.checkInDate?.slice(0, 10) ?? '',
      checkOutDate: defaultValues?.checkOutDate?.slice(0, 10) ?? '',
      numberOfRooms: defaultValues?.numberOfRooms,
      roomPlan: defaultValues?.roomPlan ?? '',
      roomAllocation: defaultValues?.roomAllocation ?? '',
      totalRate: defaultValues?.totalRate,
      confirmationNumber: defaultValues?.confirmationNumber ?? '',
      status: defaultValues?.status ?? 'PENDING',
    },
  });

  const alloc = useVendorAllocation('HOTEL', {
    vendorId: defaultValues?.vendorId,
    vendorName: defaultValues?.vendorName,
    vendorContact: defaultValues?.vendorContact,
    contactPerson: defaultValues?.contactPerson,
    rate: defaultValues?.rate,
    advanceRequired: defaultValues?.advanceRequired,
  });
  const [pendingData, setPendingData] = useState<HotelForm | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rateError, setRateError] = useState('');

  async function finalizeSubmit(data: HotelForm) {
    const vendorFields = await alloc.resolve();
    onSubmit({ ...data, ...vendorFields });
  }

  function handleFormSubmit(data: HotelForm) {
    // Exactly one of Per Room Rate (alloc.values.rate) / Total Rate is
    // required — mirrors the backend's own check.
    const hasRate = alloc.values.rate.trim() !== '' && Number(alloc.values.rate) > 0;
    const hasTotalRate = data.totalRate !== undefined && data.totalRate !== null && Number(data.totalRate) > 0;
    if (!hasRate && !hasTotalRate) {
      setRateError('Enter either a Per Room Rate or a Total Rate');
      return;
    }
    setRateError('');
    if (alloc.hasDiverged()) {
      setPendingData(data);
      setConfirmOpen(true);
      return;
    }
    finalizeSubmit(data);
  }

  return (
    <Modal
      open={open} onClose={onClose} title={defaultValues ? 'Edit Hotel' : 'Add Hotel'} size="lg"
      footer={<>
        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        <button form="hotel-form" type="submit" disabled={isLoading} className="btn-primary">{isLoading ? 'Saving…' : defaultValues ? 'Update' : 'Add Hotel'}</button>
      </>}
    >
      <form id="hotel-form" onSubmit={handleSubmit(handleFormSubmit)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="label">Hotel Name *</label>
          <input {...register('name', { required: true })} className="input" placeholder="Hotel name" />
        </div>
        <div>
          <label className="label">Location</label>
          <input {...register('location')} className="input" />
        </div>
        <div>
          <label className="label">Status</label>
          <select {...register('status')} className="input">
            <option value="PENDING">Pending</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        <div>
          <label className="label">Check-in Date</label>
          <input type="date" {...register('checkInDate')} className="input" />
        </div>
        <div>
          <label className="label">Check-out Date</label>
          <input type="date" {...register('checkOutDate')} className="input" />
        </div>
        <div>
          <label className="label">Number of Rooms</label>
          <input type="number" {...register('numberOfRooms')} className="input" />
        </div>
        <div>
          <label className="label">Room Plan</label>
          <select {...register('roomPlan')} className="input">
            <option value="">— Select Plan —</option>
            {ROOM_PLAN_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Confirmation Number</label>
          <input {...register('confirmationNumber')} className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Room Allocation</label>
          <input {...register('roomAllocation')} className="input" placeholder="e.g. 5 Double, 2 Triple" />
        </div>
        <div>
          <label className="label">Total Rate (₹)</label>
          <input type="number" step="1" {...register('totalRate')} className="input" placeholder="Lump sum, if not quoted per-room" />
        </div>

        {rateError && <p className="sm:col-span-2 text-red-500 text-xs -mt-2">{rateError}</p>}

        <VendorAllocationFields alloc={alloc} />
      </form>

      <VendorDivergenceConfirm
        open={confirmOpen}
        vendorName={alloc.values.vendorName}
        isLoading={isLoading}
        onCancel={() => { setConfirmOpen(false); setPendingData(null); }}
        onConfirm={() => { if (pendingData) finalizeSubmit(pendingData); setConfirmOpen(false); }}
      />
    </Modal>
  );
}

function RoomAllocationModal({ open, onClose, departureId, hotels }: {
  open: boolean; onClose: () => void; departureId: string; hotels: Hotel[];
}) {
  const { data, isFetching, refetch } = useRoomAllocationSuggestion(departureId);
  const updateHotel = useUpdateHotel(departureId);
  const [hotelId, setHotelId] = useState(hotels[0]?.id ?? '');
  const [text, setText] = useState('');

  useEffect(() => { if (open) refetch(); }, [open]);
  useEffect(() => { if (data?.data) setText(data.data.summaryText); }, [data]);

  const rooms = data?.data.rooms ?? [];

  return (
    <Modal
      open={open} onClose={onClose} title="Suggested Room Allocation" size="lg"
      footer={<>
        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        <button
          onClick={() => hotelId && updateHotel.mutate({ id: hotelId, roomAllocation: text } as any, { onSuccess: onClose })}
          disabled={!hotelId || !text.trim() || updateHotel.isPending}
          className="btn-primary"
        >
          {updateHotel.isPending ? 'Applying…' : 'Apply to Hotel'}
        </button>
      </>}
    >
      {isFetching ? (
        <p className="text-sm text-slate-400">Generating suggestion…</p>
      ) : rooms.length === 0 ? (
        <p className="text-sm text-slate-400">No traveler details available yet to suggest rooms from.</p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {rooms.map((r) => (
              <div key={r.roomNumber} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100 text-sm">
                <span className="font-semibold text-slate-700 flex-shrink-0">Room {r.roomNumber}</span>
                <span className="text-slate-500 flex-shrink-0">({r.roomType})</span>
                <span className="text-slate-600 flex-1">{r.travelerNames.join(', ')}</span>
                {r.note && <span className="text-amber-600 text-xs flex-shrink-0">{r.note}</span>}
              </div>
            ))}
          </div>
          <div>
            <label className="label">Apply to Hotel</label>
            <select value={hotelId} onChange={(e) => setHotelId(e.target.value)} className="input">
              {hotels.length === 0 && <option value="">Add a hotel first</option>}
              {hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Room Allocation Summary (editable before saving)</label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className="input font-mono text-xs" />
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Hotel Required — day-wise, from the package itinerary ───────────────────

function formatDateStr(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function HotelRequirementsByStay({ blocks, onFillDetails, onEdit }: {
  blocks: HotelRequirementBlock[];
  onFillDetails: (block: HotelRequirementBlock) => void;
  onEdit: (hotelId: string) => void;
}) {
  if (blocks.length === 0) {
    return (
      <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-700">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>
          This package's itinerary has no city info yet, so a day-wise breakdown can't be shown —
          add a City for each STAY night under Packages → Day Plan, and it'll appear here
          automatically. The room-count summary below still works from bookings as usual.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Hotel Required — by stay</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {blocks.map((b, i) => (
          <div key={i} className={cn('card p-4 space-y-2 border', b.fulfilled ? 'border-emerald-200 bg-emerald-50/30' : 'border-amber-200 bg-amber-50/20')}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-primary-500" />
                <span className="font-semibold text-slate-800 text-sm">{b.location}</span>
              </div>
              {b.fulfilled
                ? <span className="badge bg-emerald-50 text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Booked</span>
                : <span className="badge bg-amber-50 text-amber-700">Pending</span>}
            </div>
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              {formatDateStr(b.checkIn)} → {formatDateStr(b.checkOut)} · {b.nights} night{b.nights !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <BedDouble className="w-3.5 h-3.5" />{b.roomsNeeded} room{b.roomsNeeded !== 1 ? 's' : ''} needed
            </p>
            {!b.fulfilled ? (
              <button onClick={() => onFillDetails(b)} className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1 pt-1">
                <Plus className="w-3 h-3" />Fill Details
              </button>
            ) : b.matchedHotelId && (
              <button onClick={() => onEdit(b.matchedHotelId!)} className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1 pt-1">
                <Pencil className="w-3 h-3" />Edit
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Room requirements panel ──────────────────────────────────────────────────

interface RoomReqProps {
  roomsRequired: number;
  hotels: Hotel[];
}

function RoomRequirements({ roomsRequired, hotels }: RoomReqProps) {
  if (roomsRequired <= 0) return null;
  const roomsBooked = hotels
    .filter((h) => h.status === 'CONFIRMED')
    .reduce((s, h) => s + (h.numberOfRooms ?? 0), 0);
  const roomsPending = Math.max(0, roomsRequired - roomsBooked);
  return (
    <div className="card p-4 bg-primary-50 border border-primary-100">
      <div className="flex items-center gap-2 mb-3">
        <Info className="w-4 h-4 text-primary-600 flex-shrink-0" />
        <p className="text-sm font-semibold text-primary-800">Room requirements from bookings</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-primary-200 shadow-sm">
          <BedDouble className="w-3.5 h-3.5 text-primary-500" />
          <span className="text-xs text-slate-600">Required</span>
          <span className="text-xs font-bold text-slate-700">{roomsRequired} rooms</span>
        </div>
        <div className={cn(
          'flex items-center gap-2 rounded-xl px-3 py-2 border shadow-sm',
          roomsBooked >= roomsRequired ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-primary-200',
        )}>
          <BedDouble className={cn('w-3.5 h-3.5', roomsBooked >= roomsRequired ? 'text-emerald-500' : 'text-slate-400')} />
          <span className="text-xs text-slate-600">Confirmed</span>
          <span className="text-xs font-bold text-slate-700">{roomsBooked} rooms</span>
        </div>
        {roomsPending > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 rounded-xl px-3 py-2 border border-amber-200 shadow-sm">
            <BedDouble className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs text-slate-600">Still needed</span>
            <span className="text-xs font-bold text-amber-700">{roomsPending} rooms</span>
          </div>
        )}
      </div>
      <p className="text-[10px] text-primary-500 mt-2">
        Rooms required are calculated from booking room-sharing preferences. Confirmed rooms are from hotels with CONFIRMED status.
      </p>
    </div>
  );
}

export default function HotelsTab({ departureId, hotels, roomsRequired = 0, hotelRequirements = [], defaultCheckIn, defaultCheckOut, defaultLocation, autoOpenAdd }: {
  departureId: string;
  hotels: Hotel[];
  roomsRequired?: number;
  hotelRequirements?: HotelRequirementBlock[];
  defaultCheckIn?: string;
  defaultCheckOut?: string;
  defaultLocation?: string;
  autoOpenAdd?: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editHotel, setEditHotel] = useState<Hotel | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [allocationOpen, setAllocationOpen] = useState(false);
  const [blockPrefill, setBlockPrefill] = useState<Partial<Hotel> | null>(null);

  const createHotel = useCreateHotel(departureId);
  const updateHotel = useUpdateHotel(departureId);
  const deleteHotel = useDeleteHotel(departureId);

  // Arriving here from Rooms Required with a specific stay already picked —
  // jump straight into a pre-filled Add Hotel form instead of making the
  // operator retype the location and dates that are already known.
  useEffect(() => {
    if (autoOpenAdd) setAddOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenAdd]);

  const handleFillDetails = (block: HotelRequirementBlock) => {
    setBlockPrefill({ location: block.location, checkInDate: block.checkIn, checkOutDate: block.checkOut, numberOfRooms: block.roomsNeeded });
    setAddOpen(true);
  };

  const addDefaults: Partial<Hotel> | undefined = blockPrefill ?? ((defaultCheckIn || defaultLocation)
    ? { location: defaultLocation, checkInDate: defaultCheckIn, checkOutDate: defaultCheckOut }
    : undefined);

  return (
    <div className="space-y-4">
      <HotelRequirementsByStay
        blocks={hotelRequirements}
        onFillDetails={handleFillDetails}
        onEdit={(hotelId) => { const h = hotels.find((x) => x.id === hotelId); if (h) setEditHotel(h); }}
      />
      <RoomRequirements roomsRequired={roomsRequired} hotels={hotels} />

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => { setBlockPrefill(null); setAddOpen(true); }} className="btn-primary text-sm">
          <Plus className="w-4 h-4" />Add Hotel
        </button>
        <button onClick={() => setAllocationOpen(true)} className="btn-secondary text-sm">
          <Wand2 className="w-4 h-4" />Suggest Room Allocation
        </button>
      </div>

      {hotels.length === 0 ? (
        <div className="empty-state">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No hotels added yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {hotels.map((h) => (
            <div key={h.id} className="card p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{h.name}</p>
                  {h.location && <p className="text-xs text-slate-400 flex items-center gap-1"><MapPin className="w-3 h-3" />{h.location}</p>}
                </div>
                <span className={cn('badge', STATUS_BADGE[h.status])}>{h.status}</span>
              </div>
              <div className="text-xs text-slate-500 space-y-1">
                {h.checkInDate && <p>Check-in: {formatDate(h.checkInDate)}</p>}
                {h.checkOutDate && <p>Check-out: {formatDate(h.checkOutDate)}</p>}
                {h.numberOfRooms && <p>{h.numberOfRooms} room(s){h.roomPlan ? ` · ${h.roomPlan}` : ''}{h.roomAllocation ? ` — ${h.roomAllocation}` : ''}</p>}
                {h.confirmationNumber && <p className="flex items-center gap-1"><FileCheck className="w-3 h-3" />{h.confirmationNumber}</p>}
                {h.vendorName && <p className="flex items-center gap-1"><Phone className="w-3 h-3" />{h.vendorName} {h.vendorContact && `· ${h.vendorContact}`}</p>}
                {h.contactPerson && <p className="flex items-center gap-1"><User className="w-3 h-3" />{h.contactPerson}</p>}
                {h.totalRate != null && <p className="flex items-center gap-1"><IndianRupee className="w-3 h-3" />{h.totalRate.toLocaleString('en-IN')} total</p>}
                {h.rate != null && <p className="flex items-center gap-1"><IndianRupee className="w-3 h-3" />{h.rate.toLocaleString('en-IN')}/room</p>}
                {h.advanceRequired != null && <p className="text-amber-600">Advance required: ₹{h.advanceRequired.toLocaleString('en-IN')}</p>}
                {h.checkedInAt && <p className="text-emerald-600">Trip Captain checked in {formatRelativeTime(h.checkedInAt)}</p>}
                {h.checkedOutAt && <p className="text-emerald-600">Trip Captain checked out {formatRelativeTime(h.checkedOutAt)}</p>}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button onClick={() => setEditHotel(h)} className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1">
                  <Pencil className="w-3 h-3" />Edit
                </button>
                <button onClick={() => setDeleteId(h.id)} className="text-xs font-medium text-red-500 hover:text-red-600 flex items-center gap-1">
                  <Trash2 className="w-3 h-3" />Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <HotelFormModal
        // Keyed on the prefill so switching which stay block "Fill Details"
        // was clicked for forces a fresh form instance — react-hook-form's
        // defaultValues only ever apply once per mount otherwise, which
        // would leave a previous block's dates/location stuck in the form.
        key={blockPrefill ? `${blockPrefill.location}-${blockPrefill.checkInDate}` : 'default'}
        open={addOpen} onClose={() => { setAddOpen(false); setBlockPrefill(null); }} isLoading={createHotel.isPending}
        defaultValues={addDefaults}
        onSubmit={(data) => createHotel.mutate(data as any, { onSuccess: () => { setAddOpen(false); setBlockPrefill(null); } })}
      />
      <HotelFormModal
        open={!!editHotel} onClose={() => setEditHotel(null)} defaultValues={editHotel ?? undefined} isLoading={updateHotel.isPending}
        onSubmit={(data) => editHotel && updateHotel.mutate({ id: editHotel.id, ...data } as any, { onSuccess: () => setEditHotel(null) })}
      />
      <Modal
        open={!!deleteId} onClose={() => setDeleteId(null)} title="Remove Hotel" size="sm"
        footer={<>
          <button onClick={() => setDeleteId(null)} className="btn-secondary">Cancel</button>
          <button onClick={() => deleteId && deleteHotel.mutate(deleteId, { onSuccess: () => setDeleteId(null) })} disabled={deleteHotel.isPending} className="btn-danger">
            {deleteHotel.isPending ? 'Removing…' : 'Remove'}
          </button>
        </>}
      >
        <p className="text-sm text-slate-600">Remove this hotel from the departure?</p>
      </Modal>

      <RoomAllocationModal open={allocationOpen} onClose={() => setAllocationOpen(false)} departureId={departureId} hotels={hotels} />
    </div>
  );
}
