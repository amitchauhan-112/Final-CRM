import { AlertTriangle } from 'lucide-react';
import { useVendorAllocation } from '../../hooks/useVendorAllocation';
import Modal from '../ui/Modal';

/**
 * Vendor picker + rate/contact fields shared by the Hotel and Vehicle
 * allocation forms. Selecting an existing vendor autofills rate and contact
 * details from the vendor directory; "+ Add New Vendor" reveals blank fields
 * (optionally saved back to the directory on submit). Fields stay editable
 * even after autofill — divergence from the linked vendor's saved values is
 * surfaced by the caller (see hasDiverged()) as a confirm-before-save warning
 * rather than blocking edits outright.
 */
export function VendorAllocationFields({ alloc }: { alloc: ReturnType<typeof useVendorAllocation> }) {
  const { vendors, values, selectVendorId, updateField, hasDiverged, saveAsNewVendor, setSaveAsNewVendor } = alloc;
  const isNew = values.vendorId === '__new__';

  return (
    <div className="sm:col-span-2 space-y-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
      <div>
        <label className="label">Vendor</label>
        <select
          value={values.vendorId}
          onChange={(e) => selectVendorId(e.target.value)}
          className="input"
        >
          <option value="">— Select or add a vendor —</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>{v.name}{v.rate != null ? ` · ₹${v.rate}` : ''}</option>
          ))}
          <option value="__new__">+ Add New Vendor</option>
        </select>
      </div>

      {(isNew || values.vendorId) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {isNew && (
            <div className="sm:col-span-2">
              <label className="label">Vendor Name *</label>
              <input value={values.vendorName} onChange={(e) => updateField('vendorName', e.target.value)} className="input" placeholder="Vendor name" />
            </div>
          )}
          <div>
            <label className="label">Contact Person</label>
            <input value={values.contactPerson} onChange={(e) => updateField('contactPerson', e.target.value)} className="input" placeholder="Point of contact" />
          </div>
          <div>
            <label className="label">Contact Number</label>
            <input value={values.vendorContact} onChange={(e) => updateField('vendorContact', e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">Rate (₹)</label>
            <input type="number" step="0.01" value={values.rate} onChange={(e) => updateField('rate', e.target.value)} className="input" />
          </div>
          {isNew && (
            <label className="flex items-center gap-2 text-xs text-slate-600 sm:col-span-2 pt-1">
              <input type="checkbox" checked={saveAsNewVendor} onChange={(e) => setSaveAsNewVendor(e.target.checked)} className="rounded" />
              Save as a new vendor in the directory for future bookings
            </label>
          )}
          {hasDiverged() && (
            <div className="sm:col-span-2 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>These details differ from {values.vendorName}'s saved profile — you'll be asked to confirm before saving.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Confirmation gate before saving edited-away-from-vendor-profile values. Render alongside the form modal. */
export function VendorDivergenceConfirm({ open, vendorName, onCancel, onConfirm, isLoading }: {
  open: boolean; vendorName: string; onCancel: () => void; onConfirm: () => void; isLoading: boolean;
}) {
  return (
    <Modal
      open={open} onClose={onCancel} title="Confirm custom vendor details" size="sm"
      footer={<>
        <button onClick={onCancel} className="btn-secondary">Go Back</button>
        <button onClick={onConfirm} disabled={isLoading} className="btn-primary">{isLoading ? 'Saving…' : 'Save Anyway'}</button>
      </>}
    >
      <p className="text-sm text-slate-600">
        The rate and/or contact details here no longer match <strong>{vendorName}</strong>'s saved profile in the vendor directory.
        Saving will use these custom values for this booking only — the vendor directory itself won't change.
      </p>
    </Modal>
  );
}
