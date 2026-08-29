import { useState } from 'react';
import { useVendors, useCreateVendor } from './useOperations';
import { Vendor } from '../types/index';

export interface VendorAllocationValues {
  vendorId: string;       // '' = none selected, '__new__' = adding a new vendor inline
  vendorName: string;
  vendorContact: string;
  contactPerson: string;
  rate: string;           // kept as string for form inputs, parsed to number on save
}

const EMPTY: VendorAllocationValues = { vendorId: '', vendorName: '', vendorContact: '', contactPerson: '', rate: '' };

function fromVendor(v: Vendor): VendorAllocationValues {
  return {
    vendorId: v.id,
    vendorName: v.name,
    vendorContact: v.contact ?? '',
    contactPerson: v.contactPerson ?? '',
    rate: v.rate != null ? String(v.rate) : '',
  };
}

/**
 * Shared logic for the Hotel/Vehicle allocation forms' vendor picker: select
 * an existing vendor (autofills rate/contact from the vendor directory),
 * add a brand-new one inline (optionally saved back to the directory), and
 * detect when autofilled fields have been hand-edited so the caller can warn
 * before saving instead of silently diverging from the vendor's profile.
 */
export function useVendorAllocation(vendorType: 'HOTEL' | 'VEHICLE', initial?: Partial<{ vendorId: string; vendorName: string; vendorContact: string; contactPerson: string; rate: number }>) {
  const { data } = useVendors({ type: vendorType, status: 'ACTIVE' });
  const vendors = data?.data ?? [];
  const createVendor = useCreateVendor();

  const initialValues: VendorAllocationValues = {
    vendorId: initial?.vendorId ?? '',
    vendorName: initial?.vendorName ?? '',
    vendorContact: initial?.vendorContact ?? '',
    contactPerson: initial?.contactPerson ?? '',
    rate: initial?.rate != null ? String(initial.rate) : '',
  };

  const [values, setValues] = useState<VendorAllocationValues>(initialValues);
  // Snapshot of the vendor's own saved values at the moment it was selected —
  // null when nothing is linked to an existing vendor (new/manual entry).
  const [snapshot, setSnapshot] = useState<VendorAllocationValues | null>(
    initial?.vendorId ? initialValues : null,
  );
  const [saveAsNewVendor, setSaveAsNewVendor] = useState(false);

  function selectVendorId(vendorId: string) {
    if (!vendorId) {
      setValues(EMPTY);
      setSnapshot(null);
      setSaveAsNewVendor(false);
      return;
    }
    if (vendorId === '__new__') {
      setValues({ ...EMPTY, vendorId: '__new__' });
      setSnapshot(null);
      setSaveAsNewVendor(true);
      return;
    }
    const v = vendors.find((x) => x.id === vendorId);
    if (!v) return;
    const next = fromVendor(v);
    setValues(next);
    setSnapshot(next);
    setSaveAsNewVendor(false);
  }

  function updateField<K extends keyof VendorAllocationValues>(key: K, value: VendorAllocationValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  /** True when rate/contact fields have been hand-edited away from the linked vendor's saved profile. */
  function hasDiverged(): boolean {
    if (!snapshot) return false;
    return (
      values.vendorContact !== snapshot.vendorContact ||
      values.contactPerson !== snapshot.contactPerson ||
      values.rate !== snapshot.rate
    );
  }

  /** Resolves the final vendorId/name/contact/rate to submit, creating a new Vendor record first if needed. */
  async function resolve(): Promise<{ vendorId?: string; vendorName?: string; vendorContact?: string; contactPerson?: string; rate?: number }> {
    const rateNum = values.rate.trim() ? Number(values.rate) : undefined;

    if (values.vendorId === '__new__' && values.vendorName.trim()) {
      if (saveAsNewVendor) {
        const created = await createVendor.mutateAsync({
          name: values.vendorName.trim(),
          type: vendorType,
          contact: values.vendorContact.trim() || undefined,
          contactPerson: values.contactPerson.trim() || undefined,
          rate: rateNum,
          status: 'ACTIVE',
        });
        return { vendorId: created.id, vendorName: values.vendorName.trim(), vendorContact: values.vendorContact.trim() || undefined, contactPerson: values.contactPerson.trim() || undefined, rate: rateNum };
      }
      return { vendorId: undefined, vendorName: values.vendorName.trim(), vendorContact: values.vendorContact.trim() || undefined, contactPerson: values.contactPerson.trim() || undefined, rate: rateNum };
    }

    return {
      vendorId: values.vendorId || undefined,
      vendorName: values.vendorName.trim() || undefined,
      vendorContact: values.vendorContact.trim() || undefined,
      contactPerson: values.contactPerson.trim() || undefined,
      rate: rateNum,
    };
  }

  return { vendors, values, selectVendorId, updateField, hasDiverged, resolve, saveAsNewVendor, setSaveAsNewVendor, isCreatingVendor: createVendor.isPending };
}
