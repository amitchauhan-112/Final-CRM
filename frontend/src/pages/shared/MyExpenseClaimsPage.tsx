import { useState } from 'react';
import { Receipt, Plus, Paperclip } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { useMyExpenseClaims, useCreateExpenseClaim } from '../../hooks/useExpenseClaims';
import { useMyPartner } from '../../hooks/usePartnerLedger';
import { formatCurrency, formatDate, cn } from '../../utils/helpers';

const CATEGORIES = [
  'HOTEL', 'VEHICLE', 'DRIVER', 'GUIDE', 'MEALS', 'PERMITS', 'FUEL',
  'MISCELLANEOUS', 'OFFICE', 'MARKETING', 'SALARY', 'SOFTWARE', 'UTILITIES',
];

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-600',
};

function ClaimModal({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState('MISCELLANEOUS');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [bill, setBill] = useState<File | null>(null);
  const [markPartner, setMarkPartner] = useState(false);
  const [error, setError] = useState('');
  const { data: mine } = useMyPartner();
  const myPartner = mine?.data;
  const create = useCreateExpenseClaim();

  const submit = () => {
    const amt = Number(amount);
    if (!amt || amt <= 0 || !Number.isInteger(amt)) { setError('Enter a whole rupee amount'); return; }
    create.mutate(
      { category, amount: amt, description: description.trim() || undefined, paidByPartnerId: markPartner && myPartner ? myPartner.id : undefined, bill: bill ?? undefined },
      { onSuccess: onClose }
    );
  };

  return (
    <Modal open onClose={onClose} title="Claim an Expense" size="sm">
      <div className="space-y-4">
        <p className="text-xs text-slate-500">For your own small spend on company work. An Admin will review it.</p>
        <div>
          <label className="label">Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Amount (₹) <span className="text-red-500">*</span></label>
          <input type="number" min={1} value={amount} onChange={(e) => { setAmount(e.target.value); setError(''); }} className="input" />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input resize-none" placeholder="What was this for?" />
        </div>
        <div>
          <label className="label flex items-center gap-1.5"><Paperclip className="w-3.5 h-3.5" /> Bill / receipt (optional)</label>
          <input type="file" accept="image/*,.pdf" onChange={(e) => setBill(e.target.files?.[0] ?? null)} className="input" />
        </div>
        {myPartner && (
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={markPartner} onChange={(e) => setMarkPartner(e.target.checked)} className="w-4 h-4" />
            This was paid by me as {myPartner.name} (counts toward the partner ledger)
          </label>
        )}
        {error && <p className="text-red-500 text-xs">{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={submit} disabled={create.isPending} className="btn-primary">{create.isPending ? 'Submitting…' : 'Submit Claim'}</button>
        </div>
      </div>
    </Modal>
  );
}

export default function MyExpenseClaimsPage() {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useMyExpenseClaims();
  const claims = data?.data ?? [];

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h2 className="page-title">My Expense Claims</h2>
          <p className="page-subtitle">Small spends you paid yourself — an Admin reviews each one</p>
        </div>
        <button onClick={() => setOpen(true)} className="btn-primary gap-1.5"><Plus className="w-4 h-4" /> Claim an Expense</button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : claims.length === 0 ? (
        <div className="empty-state">
          <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No claims yet</p>
        </div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {claims.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium text-slate-800 text-sm">{c.category.charAt(0) + c.category.slice(1).toLowerCase()}{c.paidByPartner ? ` · ${c.paidByPartner.name}` : ''}</p>
                <p className="text-xs text-slate-400">{c.description || '—'} · {formatDate(c.createdAt)}</p>
                {c.status === 'REJECTED' && c.rejectionReason && <p className="text-xs text-red-500 mt-0.5">{c.rejectionReason}</p>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-700 tabular">{formatCurrency(c.amount)}</span>
                <span className={cn('badge', STATUS_BADGE[c.status])}>{c.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && <ClaimModal onClose={() => setOpen(false)} />}
    </div>
  );
}
