import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Building2, Pencil, Phone, User, IndianRupee } from 'lucide-react';
import { useVendors, useCreateVendor, useUpdateDeparture } from '../../hooks/useOperations';
import { Departure } from '../../types/index';
import { blockDecimalKey } from '../../utils/helpers';

interface FormValues { b2bVendorId: string; b2bRate?: number; }

// Compact, always-visible card (not a tab) — most departures never use this,
// so it stays collapsed to a single "+ add" prompt until there's something
// to show. Tracks a whole trip resold/subcontracted to another travel
// company at a wholesale rate, distinct from the original customer-facing
// Booking.finalPrice. The company is a Vendor (type "B2B") — same directory
// Hotels/Vehicles use — and the rate syncs to a VendorPayment for Finance
// (see updateDeparture in departure.controller.ts), so it's already in the
// P&L report's vendor-cost total without any separate reporting path.
export default function B2BSaleCard({ departure }: { departure: Departure }) {
  const { data: vendorsData } = useVendors({ type: 'B2B', status: 'ACTIVE' });
  const createVendor = useCreateVendor();
  const updateDeparture = useUpdateDeparture(departure.id);
  const vendors = vendorsData?.data ?? [];

  const [editing, setEditing] = useState(false);
  const [addingVendor, setAddingVendor] = useState(false);
  const [newVendor, setNewVendor] = useState({ name: '', contactPerson: '', contact: '' });

  const { register, handleSubmit, setValue, reset } = useForm<FormValues>({
    defaultValues: { b2bVendorId: departure.b2bVendorId ?? '', b2bRate: departure.b2bRate },
  });

  const startEdit = () => {
    reset({ b2bVendorId: departure.b2bVendorId ?? '', b2bRate: departure.b2bRate });
    setEditing(true);
  };

  const handleAddVendor = () => {
    if (!newVendor.name.trim()) return;
    createVendor.mutate(
      { name: newVendor.name.trim(), type: 'B2B', contactPerson: newVendor.contactPerson.trim() || undefined, contact: newVendor.contact.trim() || undefined, status: 'ACTIVE' },
      {
        onSuccess: (vendor: any) => {
          setValue('b2bVendorId', vendor.id);
          setAddingVendor(false);
          setNewVendor({ name: '', contactPerson: '', contact: '' });
        },
      }
    );
  };

  const onSubmit = (data: FormValues) => {
    updateDeparture.mutate({ b2bVendorId: data.b2bVendorId || null, b2bRate: data.b2bRate ?? null } as any, {
      onSuccess: () => setEditing(false),
    });
  };

  if (!editing && !departure.b2bVendor) {
    return (
      <button
        onClick={startEdit}
        className="w-full text-left card p-3 border-dashed border-2 border-slate-200 hover:border-primary-300 transition-colors text-sm text-slate-400 hover:text-primary-600 flex items-center gap-2"
      >
        <Building2 className="w-4 h-4" />
        Trip resold to another company (B2B)? Click to add.
      </button>
    );
  }

  if (!editing && departure.b2bVendor) {
    return (
      <div className="card p-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Resold (B2B) to</p>
            <p className="font-semibold text-slate-800 text-sm">{departure.b2bVendor.name}</p>
            <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 flex-wrap">
              {departure.b2bRate != null && <span className="flex items-center gap-1 font-semibold text-violet-700"><IndianRupee className="w-3 h-3" />{departure.b2bRate.toLocaleString('en-IN')}</span>}
              {departure.b2bVendor.contactPerson && <span className="flex items-center gap-1"><User className="w-3 h-3" />{departure.b2bVendor.contactPerson}</span>}
              {departure.b2bVendor.contact && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{departure.b2bVendor.contact}</span>}
            </div>
          </div>
        </div>
        <button onClick={startEdit} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-primary-600 flex-shrink-0">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card p-4 space-y-3">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">B2B Sale — resold this trip to another company</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Sold To Company</label>
          {addingVendor ? (
            <div className="space-y-2">
              <input autoFocus value={newVendor.name} onChange={(e) => setNewVendor((c) => ({ ...c, name: e.target.value }))} placeholder="Company name" className="input" />
              <div className="grid grid-cols-2 gap-2">
                <input value={newVendor.contactPerson} onChange={(e) => setNewVendor((c) => ({ ...c, contactPerson: e.target.value }))} placeholder="Contact person" className="input text-sm" />
                <input value={newVendor.contact} onChange={(e) => setNewVendor((c) => ({ ...c, contact: e.target.value }))} placeholder="Contact number" className="input text-sm" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={handleAddVendor} disabled={createVendor.isPending} className="btn-secondary text-xs px-3">{createVendor.isPending ? '…' : 'Add Company'}</button>
                <button type="button" onClick={() => setAddingVendor(false)} className="text-slate-400 hover:text-slate-600 text-xs px-1">Cancel</button>
              </div>
            </div>
          ) : (
            <select
              {...register('b2bVendorId')}
              onChange={(e) => { if (e.target.value === '__new__') { setAddingVendor(true); setValue('b2bVendorId', ''); } else { register('b2bVendorId').onChange(e); } }}
              className="input"
            >
              <option value="">— Select company —</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              <option value="__new__">+ Add New Company</option>
            </select>
          )}
        </div>
        <div>
          <label className="label">B2B Rate (₹)</label>
          <input type="number" step="1" onKeyDown={blockDecimalKey} {...register('b2bRate')} className="input" placeholder="What the other company paid" />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={() => setEditing(false)} className="btn-secondary text-sm">Cancel</button>
        <button type="submit" disabled={updateDeparture.isPending} className="btn-primary text-sm">{updateDeparture.isPending ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
}
