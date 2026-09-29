import { useState } from 'react';
import Modal from '../ui/Modal';
import { useAddVendorPaymentEntry } from '../../hooks/useFinance';
import { blockDecimalKey } from '../../utils/helpers';
import { VendorPaymentEntryMethod } from '../../types/index';

const METHOD_LABEL: Record<VendorPaymentEntryMethod, string> = {
  CASH: 'Cash', UPI: 'UPI', BANK_TRANSFER: 'Bank Transfer', CHEQUE: 'Cheque',
  CUSTOMER_DIRECT: 'Customer paid vendor directly',
  CREDIT: 'On credit (not paid yet — just noting it down)',
  VENDOR_REFUND: 'Vendor refunded us',
};

export default function AddVendorPaymentEntryModal({ open, onClose, vendorPaymentId }: {
  open: boolean; onClose: () => void; vendorPaymentId: string;
}) {
  const addEntry = useAddVendorPaymentEntry();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<VendorPaymentEntryMethod>('CASH');
  const [note, setNote] = useState('');

  const reset = () => { setAmount(''); setMethod('CASH'); setNote(''); };
  const valid = amount.trim() !== '' && Number.isInteger(Number(amount)) && Number(amount) > 0;

  return (
    <Modal
      open={open} onClose={() => { reset(); onClose(); }} title="Record a Payment / Credit" size="sm"
      footer={<>
        <button onClick={() => { reset(); onClose(); }} className="btn-secondary">Cancel</button>
        <button
          onClick={() => addEntry.mutate(
            { id: vendorPaymentId, amount: Number(amount), method, note: note || undefined },
            { onSuccess: () => { reset(); onClose(); } }
          )}
          disabled={addEntry.isPending || !valid} className="btn-primary"
        >
          {addEntry.isPending ? 'Saving…' : 'Add'}
        </button>
      </>}
    >
      <div className="space-y-3">
        <div>
          <label className="label">Amount (₹) *</label>
          <input type="number" min={1} step="1" onKeyDown={blockDecimalKey} value={amount} onChange={(e) => setAmount(e.target.value)} className="input" />
          {!valid && amount !== '' && <p className="text-xs text-red-500 mt-1">Enter a whole number greater than 0</p>}
        </div>
        <div>
          <label className="label">How</label>
          <select value={method} onChange={(e) => setMethod(e.target.value as VendorPaymentEntryMethod)} className="input">
            {Object.entries(METHOD_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {method === 'CUSTOMER_DIRECT' && (
            <p className="text-xs text-slate-400 mt-1">Reduces what we owe — the customer settled this amount straight with the vendor.</p>
          )}
          {method === 'CREDIT' && (
            <p className="text-xs text-slate-400 mt-1">Just a note — this doesn't reduce the balance, since nothing was actually paid.</p>
          )}
          {method === 'VENDOR_REFUND' && (
            <p className="text-xs text-slate-400 mt-1">Use this when the vendor sends money back (e.g. they'd been overpaid).</p>
          )}
        </div>
        <div>
          <label className="label">Note</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input" placeholder="Optional — e.g. which booking, why" />
        </div>
      </div>
    </Modal>
  );
}
