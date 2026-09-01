import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useFinanceDepartures, useFinancePackages } from '../../hooks/useExpenses';
import { useFinanceVendors } from '../../hooks/useFinance';
import { ExpenseCategory } from '../../types/index';
import Modal from '../ui/Modal';

const CATEGORIES: ExpenseCategory[] = [
  'HOTEL', 'VEHICLE', 'DRIVER', 'GUIDE', 'MEALS', 'PERMITS', 'FUEL', 'MISCELLANEOUS',
  'OFFICE', 'MARKETING', 'SALARY', 'SOFTWARE', 'UTILITIES',
];

interface ExpenseFormValues {
  category: ExpenseCategory;
  amount: number;
  description?: string;
  departureId?: string;
  packageId?: string;
  vendorId?: string;
}

export default function ExpenseFormModal({ open, onClose, onSubmit, isLoading }: {
  open: boolean; onClose: () => void;
  onSubmit: (data: ExpenseFormValues & { bill?: File }) => void; isLoading: boolean;
}) {
  const { data: departuresData } = useFinanceDepartures();
  const { data: packagesData } = useFinancePackages();
  const { data: vendorsData } = useFinanceVendors();
  const departures = departuresData?.data ?? [];
  const packages = packagesData?.data ?? [];
  const vendors = vendorsData?.data ?? [];
  const [billFile, setBillFile] = useState<File | null>(null);

  const { register, handleSubmit, reset } = useForm<ExpenseFormValues>({
    defaultValues: { category: 'MISCELLANEOUS' },
  });

  const submit = (data: ExpenseFormValues) => {
    onSubmit({ ...data, bill: billFile ?? undefined });
    reset();
    setBillFile(null);
  };

  return (
    <Modal
      open={open} onClose={onClose} title="Log Expense" size="lg"
      footer={<>
        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        <button form="expense-form" type="submit" disabled={isLoading} className="btn-primary">{isLoading ? 'Saving…' : 'Log Expense'}</button>
      </>}
    >
      <form id="expense-form" onSubmit={handleSubmit(submit)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Category *</label>
          <select {...register('category', { required: true })} className="input">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Amount *</label>
          <input type="number" step="0.01" {...register('amount', { required: true, min: 0 })} className="input" />
        </div>
        <div>
          <label className="label">Trip (optional)</label>
          <select {...register('departureId')} className="input">
            <option value="">Company overhead (no trip)</option>
            {departures.map((d) => <option key={d.id} value={d.id}>{d.destination} — {new Date(d.departureDate).toLocaleDateString()}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Package (optional)</label>
          <select {...register('packageId')} className="input">
            <option value="">—</option>
            {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Vendor (optional)</label>
          <select {...register('vendorId')} className="input">
            <option value="">—</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Bill / Receipt</label>
          <input type="file" onChange={(e) => setBillFile(e.target.files?.[0] ?? null)} className="input text-sm" accept="image/*,.pdf" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Description</label>
          <textarea {...register('description')} rows={2} className="input" />
        </div>
      </form>
    </Modal>
  );
}
