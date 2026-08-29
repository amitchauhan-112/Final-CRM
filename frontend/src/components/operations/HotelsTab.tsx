import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Building2, Plus, Pencil, Trash2, MapPin, Phone, User, IndianRupee, FileCheck, Wand2, BedDouble, Info } from 'lucide-react';
import { useCreateHotel, useUpdateHotel, useDeleteHotel, useRoomAllocationSuggestion } from '../../hooks/useOperations';
import { useVendorAllocation } from '../../hooks/useVendorAllocation';
import { VendorAllocationFields, VendorDivergenceConfirm } from './VendorAllocationFields';
import { Hotel } from '../../types/index';
import Modal from '../ui/Modal';
import { formatDate, cn } from '../../utils/helpers';

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  CONFIRMED: 'bg-emerald-50 text-emerald-700',
  CANCELLED: 'bg-red-50 text-red-600',
};

interface HotelForm {
  name: string; location?: string; checkInDate?: string; checkOutDate?: string;
  numberOfRooms?: number; roomAllocation?: string;
  confirmationNumber?: string; status: string;
}

type HotelSubmitData = HotelForm & { vendorId?: string; vendorName?: string; vendorContact?: string; contactPerson?: string; rate?: number };

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
      roomAllocation: defaultValues?.roomAllocation ?? '',
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
  });
  const [pendingData, setPendingData] = useState<HotelForm | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function finalizeSubmit(data: HotelForm) {
    const vendorFields = await alloc.resolve();
    onSubmit({ ...data, ...vendorFields });
  }

  function handleFormSubmit(data: HotelForm) {
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
          <label className="label">Confirmation Number</label>
          <input {...register('confirmationNumber')} className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Room Allocation</label>
          <input {...register('roomAllocation')} className="input" placeholder="e.g. 5 Double, 2 Triple" />
        </div>

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

export default function HotelsTab({ departureId, hotels, roomsRequired = 0, defaultCheckIn, defaultCheckOut, defaultLocation, autoOpenAdd }: {
  departureId: string;
  hotels: Hotel[];
  roomsRequired?: number;
  defaultCheckIn?: string;
  defaultCheckOut?: string;
  defaultLocation?: string;
  autoOpenAdd?: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editHotel, setEditHotel] = useState<Hotel | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [allocationOpen, setAllocationOpen] = useState(false);

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

  const addDefaults: Partial<Hotel> | undefined = (defaultCheckIn || defaultLocation)
    ? { location: defaultLocation, checkInDate: defaultCheckIn, checkOutDate: defaultCheckOut }
    : undefined;

  return (
    <div className="space-y-4">
      <RoomRequirements roomsRequired={roomsRequired} hotels={hotels} />

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setAddOpen(true)} className="btn-primary text-sm">
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
                {h.numberOfRooms && <p>{h.numberOfRooms} room(s){h.roomAllocation ? ` — ${h.roomAllocation}` : ''}</p>}
                {h.confirmationNumber && <p className="flex items-center gap-1"><FileCheck className="w-3 h-3" />{h.confirmationNumber}</p>}
                {h.vendorName && <p className="flex items-center gap-1"><Phone className="w-3 h-3" />{h.vendorName} {h.vendorContact && `· ${h.vendorContact}`}</p>}
                {h.contactPerson && <p className="flex items-center gap-1"><User className="w-3 h-3" />{h.contactPerson}</p>}
                {h.rate != null && <p className="flex items-center gap-1"><IndianRupee className="w-3 h-3" />{h.rate.toLocaleString('en-IN')}</p>}
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
        open={addOpen} onClose={() => setAddOpen(false)} isLoading={createHotel.isPending}
        defaultValues={addDefaults}
        onSubmit={(data) => createHotel.mutate(data as any, { onSuccess: () => setAddOpen(false) })}
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
