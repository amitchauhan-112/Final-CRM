import { useForm } from 'react-hook-form';
import { useFinanceVendors } from '../../hooks/useFinance';
import { VendorPayment, VendorServiceType } from '../../types/index';
import Modal from '../ui/Modal';
import { blockDecimalKey, wholeNumberRule } from '../../utils/helpers';

interface VendorPaymentForm {
  vendorId: string; departureId?: string; serviceType: VendorServiceType;
  totalAmount: number; advancePaid?: number; dueDate?: string; notes?: string;
}

export default function VendorPaymentFormModal({ open, onClose, defaultValues, onSubmit, isLoading }: {
  open: boolean; onClose: () => void; defaultValues?: Partial<VendorPayment>;
  onSubmit: (data: VendorPaymentForm) => void; isLoading: boolean;
}) {
  const { data: vendorsData } = useFinanceVendors();
  const vendors = vendorsData?.data ?? [];

  const { register, handleSubmit } = useForm<VendorPaymentForm>({
    defaultValues: {
      vendorId: defaultValues?.vendorId ?? '',
      serviceType: defaultValues?.serviceType ?? 'HOTEL',
      totalAmount: defaultValues?.totalAmount,
      advancePaid: defaultValues?.advancePaid ?? 0,
      dueDate: defaultValues?.dueDate?.slice(0, 10) ?? '',
      notes: defaultValues?.notes ?? '',
    },
  });

  return (
    <Modal
      open={open} onClose={onClose} title={defaultValues ? 'Edit Vendor Bill' : 'Add Vendor Bill'} size="lg"
      footer={<>
        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        <button form="vendor-payment-form" type="submit" disabled={isLoading} className="btn-primary">{isLoading ? 'Saving…' : defaultValues ? 'Update' : 'Add Bill'}</button>
      </>}
    >
      <form id="vendor-payment-form" onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Vendor *</label>
          <select {...register('vendorId', { required: true })} className="input">
            <option value="">Select vendor…</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Service Type</label>
          <select {...register('serviceType')} className="input">
            <option value="HOTEL">Hotel</option>
            <option value="VEHICLE">Vehicle</option>
            <option value="TRIP_CAPTAIN">Trip Captain</option>
            <option value="LOCAL_GUIDE">Local Guide</option>
            <option value="LOCAL_VENDOR">Local Vendor</option>
            <option value="ACTIVITY">Activity</option>
          </select>
        </div>
        <div>
          <label className="label">Total Amount *</label>
          <input type="number" step="1" onKeyDown={blockDecimalKey} {...register('totalAmount', { required: true, min: 0, ...wholeNumberRule })} className="input" />
        </div>
        <div>
          <label className="label">Advance Paid</label>
          <input type="number" step="1" onKeyDown={blockDecimalKey} {...register('advancePaid', wholeNumberRule)} className="input" />
        </div>
        <div>
          <label className="label">Due Date</label>
          <input type="date" {...register('dueDate')} className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Notes</label>
          <textarea {...register('notes')} rows={2} className="input" />
        </div>
      </form>
    </Modal>
  );
}
