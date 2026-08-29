import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Truck, Plus, Pencil, Trash2, MapPin, Phone, User, IndianRupee, Info } from 'lucide-react';
import { useCreateVehicle, useUpdateVehicle, useDeleteVehicle } from '../../hooks/useOperations';
import { useVendorAllocation } from '../../hooks/useVendorAllocation';
import { VendorAllocationFields, VendorDivergenceConfirm } from './VendorAllocationFields';
import { Vehicle } from '../../types/index';
import Modal from '../ui/Modal';
import { cn } from '../../utils/helpers';

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  CONFIRMED: 'bg-emerald-50 text-emerald-700',
  CANCELLED: 'bg-red-50 text-red-600',
};

// ─── Vehicle requirement auto-calculator ─────────────────────────────────────

const VEHICLE_SIZES = [
  { label: '54-Seater Bus', cap: 54 },
  { label: '40-Seater Bus', cap: 40 },
  { label: '26-Seater Bus', cap: 26 },
  { label: '20-Seater Tempo Traveller', cap: 20 },
  { label: '12-Seater Tempo Traveller', cap: 12 },
];

function calcVehicles(pax: number) {
  const result: { label: string; count: number; seats: number }[] = [];
  let rem = pax;
  for (const v of VEHICLE_SIZES) {
    if (rem <= 0) break;
    const n = Math.floor(rem / v.cap);
    if (n > 0) { result.push({ label: v.label, count: n, seats: v.cap * n }); rem -= v.cap * n; }
  }
  if (rem > 0) result.push({ label: '12-Seater Tempo Traveller', count: 1, seats: 12 });
  return result;
}

function VehicleRequirements({ totalTravelers }: { totalTravelers: number }) {
  if (totalTravelers <= 0) return null;
  const recommendations = calcVehicles(totalTravelers);
  return (
    <div className="card p-4 bg-primary-50 border border-primary-100">
      <div className="flex items-center gap-2 mb-3">
        <Info className="w-4 h-4 text-primary-600 flex-shrink-0" />
        <p className="text-sm font-semibold text-primary-800">
          Auto-calculated requirements for {totalTravelers} passengers
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        {recommendations.map((r, i) => (
          <div key={i} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-primary-200 shadow-sm">
            <Truck className="w-3.5 h-3.5 text-primary-500" />
            <span className="text-xs font-bold text-slate-700">{r.count} ×</span>
            <span className="text-xs text-slate-600">{r.label}</span>
            <span className="text-[10px] text-slate-400">({r.seats} seats)</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-primary-500 mt-2">
        This is a recommendation. Actual booking may vary based on route requirements.
      </p>
    </div>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────────

interface VehicleForm {
  vehicleType?: string; vehicleNumber?: string; driverName?: string; driverMobile?: string;
  pickupTime?: string; pickupLocation?: string; status: string;
}

type VehicleSubmitData = VehicleForm & { vendorId?: string; vendorName?: string; vendorContact?: string; contactPerson?: string; rate?: number };

function VehicleFormModal({ open, onClose, defaultValues, onSubmit, isLoading }: {
  open: boolean; onClose: () => void; defaultValues?: Partial<Vehicle>;
  onSubmit: (data: VehicleSubmitData) => void; isLoading: boolean;
}) {
  const { register, handleSubmit } = useForm<VehicleForm>({
    defaultValues: {
      vehicleType: defaultValues?.vehicleType ?? '',
      vehicleNumber: defaultValues?.vehicleNumber ?? '',
      driverName: defaultValues?.driverName ?? '',
      driverMobile: defaultValues?.driverMobile ?? '',
      pickupTime: defaultValues?.pickupTime ? defaultValues.pickupTime.slice(0, 16) : '',
      pickupLocation: defaultValues?.pickupLocation ?? '',
      status: defaultValues?.status ?? 'PENDING',
    },
  });

  const alloc = useVendorAllocation('VEHICLE', {
    vendorId: defaultValues?.vendorId,
    vendorName: defaultValues?.vendorName,
    vendorContact: defaultValues?.vendorContact,
    contactPerson: defaultValues?.contactPerson,
    rate: defaultValues?.rate,
  });
  const [pendingData, setPendingData] = useState<VehicleForm | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function finalizeSubmit(data: VehicleForm) {
    const vendorFields = await alloc.resolve();
    onSubmit({ ...data, ...vendorFields });
  }

  function handleFormSubmit(data: VehicleForm) {
    if (alloc.hasDiverged()) {
      setPendingData(data);
      setConfirmOpen(true);
      return;
    }
    finalizeSubmit(data);
  }

  return (
    <Modal
      open={open} onClose={onClose} title={defaultValues ? 'Edit Vehicle' : 'Add Vehicle'} size="lg"
      footer={<>
        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        <button form="vehicle-form" type="submit" disabled={isLoading} className="btn-primary">{isLoading ? 'Saving…' : defaultValues ? 'Update' : 'Add Vehicle'}</button>
      </>}
    >
      <form id="vehicle-form" onSubmit={handleSubmit(handleFormSubmit)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Vehicle Type</label>
          <input {...register('vehicleType')} className="input" placeholder="e.g. Tempo Traveller" />
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
          <label className="label">Vehicle Number</label>
          <input {...register('vehicleNumber')} className="input" />
        </div>
        <div>
          <label className="label">Pickup Time</label>
          <input type="datetime-local" {...register('pickupTime')} className="input" />
        </div>
        <div>
          <label className="label">Driver Name</label>
          <input {...register('driverName')} className="input" />
        </div>
        <div>
          <label className="label">Driver Mobile</label>
          <input {...register('driverMobile')} className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Pickup Location</label>
          <input {...register('pickupLocation')} className="input" />
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

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function VehiclesTab({
  departureId, vehicles, totalTravelers = 0,
}: {
  departureId: string;
  vehicles: Vehicle[];
  totalTravelers?: number;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const createVehicle = useCreateVehicle(departureId);
  const updateVehicle = useUpdateVehicle(departureId);
  const deleteVehicle = useDeleteVehicle(departureId);

  return (
    <div className="space-y-4">
      <VehicleRequirements totalTravelers={totalTravelers} />

      <button onClick={() => setAddOpen(true)} className="btn-primary text-sm">
        <Plus className="w-4 h-4" />Add Vehicle
      </button>

      {vehicles.length === 0 ? (
        <div className="empty-state">
          <Truck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No vehicles added yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {vehicles.map((v) => (
            <div key={v.id} className="card p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{v.vehicleType || 'Vehicle'}</p>
                  {v.vehicleNumber && <p className="text-xs text-slate-400">{v.vehicleNumber}</p>}
                </div>
                <span className={cn('badge', STATUS_BADGE[v.status])}>{v.status}</span>
              </div>
              <div className="text-xs text-slate-500 space-y-1">
                {v.driverName && <p className="flex items-center gap-1"><User className="w-3 h-3" />{v.driverName} {v.driverMobile && `· ${v.driverMobile}`}</p>}
                {v.pickupLocation && <p className="flex items-center gap-1"><MapPin className="w-3 h-3" />{v.pickupLocation}</p>}
                {v.pickupTime && <p>Pickup: {new Date(v.pickupTime).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>}
                {v.vendorName && <p className="flex items-center gap-1"><Phone className="w-3 h-3" />{v.vendorName} {v.vendorContact && `· ${v.vendorContact}`}</p>}
                {v.contactPerson && <p className="flex items-center gap-1"><User className="w-3 h-3" />{v.contactPerson}</p>}
                {v.rate != null && <p className="flex items-center gap-1"><IndianRupee className="w-3 h-3" />{v.rate.toLocaleString('en-IN')}</p>}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button onClick={() => setEditVehicle(v)} className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1">
                  <Pencil className="w-3 h-3" />Edit
                </button>
                <button onClick={() => setDeleteId(v.id)} className="text-xs font-medium text-red-500 hover:text-red-600 flex items-center gap-1">
                  <Trash2 className="w-3 h-3" />Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <VehicleFormModal
        open={addOpen} onClose={() => setAddOpen(false)} isLoading={createVehicle.isPending}
        onSubmit={(data) => createVehicle.mutate(data as any, { onSuccess: () => setAddOpen(false) })}
      />
      <VehicleFormModal
        open={!!editVehicle} onClose={() => setEditVehicle(null)} defaultValues={editVehicle ?? undefined} isLoading={updateVehicle.isPending}
        onSubmit={(data) => editVehicle && updateVehicle.mutate({ id: editVehicle.id, ...data } as any, { onSuccess: () => setEditVehicle(null) })}
      />
      <Modal
        open={!!deleteId} onClose={() => setDeleteId(null)} title="Remove Vehicle" size="sm"
        footer={<>
          <button onClick={() => setDeleteId(null)} className="btn-secondary">Cancel</button>
          <button onClick={() => deleteId && deleteVehicle.mutate(deleteId, { onSuccess: () => setDeleteId(null) })} disabled={deleteVehicle.isPending} className="btn-danger">
            {deleteVehicle.isPending ? 'Removing…' : 'Remove'}
          </button>
        </>}
      >
        <p className="text-sm text-slate-600">Remove this vehicle from the departure?</p>
      </Modal>
    </div>
  );
}
