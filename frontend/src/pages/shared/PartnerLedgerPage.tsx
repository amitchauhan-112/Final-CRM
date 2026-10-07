import { useState } from 'react';
import { Handshake, Plus, Check, X, ArrowRight } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuthStore } from '../../store/authStore';
import {
  usePartnerLedger, useMyPartner, usePartnerCollections,
  useCreatePartnerCollection, useApprovePartnerCollection, useRejectPartnerCollection,
} from '../../hooks/usePartnerLedger';
import { formatCurrency, formatDate, cn } from '../../utils/helpers';

function LogCollectionModal({ onClose }: { onClose: () => void }) {
  const { data: ledger } = usePartnerLedger();
  const { data: mine } = useMyPartner();
  const { user } = useAuthStore();
  const isAdminOrFinance = user?.role === 'ADMIN' || user?.role === 'FINANCE';
  const partners = ledger?.data.partners ?? [];
  const myPartner = mine?.data;

  const [partnerId, setPartnerId] = useState(myPartner?.id ?? '');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const create = useCreatePartnerCollection();

  const submit = () => {
    const amt = Number(amount);
    if (!partnerId) { setError('Pick who collected this'); return; }
    if (!amt || amt <= 0 || !Number.isInteger(amt)) { setError('Enter a whole rupee amount'); return; }
    create.mutate({ partnerId, amount: amt, description: description.trim() || undefined }, { onSuccess: onClose });
  };

  return (
    <Modal open onClose={onClose} title="Log a Collection" size="sm">
      <div className="space-y-4">
        <p className="text-xs text-slate-500">Money a partner personally received on the company's behalf (e.g. cash from a customer). Needs Admin approval before it counts.</p>
        <div>
          <label className="label">Collected by</label>
          {isAdminOrFinance ? (
            <select value={partnerId} onChange={(e) => { setPartnerId(e.target.value); setError(''); }} className="input">
              <option value="">Select…</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          ) : (
            <input value={myPartner?.name ?? 'Not linked to a partner'} disabled className="input bg-slate-50" />
          )}
        </div>
        <div>
          <label className="label">Amount (₹) <span className="text-red-500">*</span></label>
          <input type="number" min={1} value={amount} onChange={(e) => { setAmount(e.target.value); setError(''); }} className="input" />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input resize-none" placeholder="e.g. Cash from Sharma family, booking #..." />
        </div>
        {error && <p className="text-red-500 text-xs">{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={submit} disabled={create.isPending || (!isAdminOrFinance && !myPartner)} className="btn-primary">
            {create.isPending ? 'Logging…' : 'Log Collection'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PendingCollections() {
  const { user } = useAuthStore();
  const { data } = usePartnerCollections();
  const approve = useApprovePartnerCollection();
  const reject = useRejectPartnerCollection();
  const pending = (data?.data ?? []).filter((c) => c.status === 'PENDING');

  if (user?.role !== 'ADMIN' || pending.length === 0) return null;

  return (
    <div className="card p-4 space-y-3">
      <h3 className="font-semibold text-slate-800 text-sm">Pending Collections ({pending.length})</h3>
      {pending.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 first:border-0 first:pt-0">
          <div>
            <p className="text-sm font-medium text-slate-800">{c.partner.name} · {formatCurrency(c.amount)}</p>
            <p className="text-xs text-slate-400">{c.description || '—'} · logged by {c.createdBy.name} · {formatDate(c.collectedAt)}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => approve.mutate(c.id)} className="btn-primary text-xs gap-1 py-1.5"><Check className="w-3.5 h-3.5" /> Approve</button>
            <button
              onClick={() => { const reason = window.prompt('Reason for rejecting?')?.trim(); if (reason) reject.mutate({ id: c.id, reason }); }}
              className="btn-secondary text-xs gap-1 py-1.5"
            ><X className="w-3.5 h-3.5" /> Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PartnerLedgerPage() {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = usePartnerLedger();
  const ledger = data?.data;

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h2 className="page-title">Partner Ledger</h2>
          <p className="page-subtitle">What each partner collected and spent for the company — equalized three ways</p>
        </div>
        <button onClick={() => setOpen(true)} className="btn-primary gap-1.5"><Plus className="w-4 h-4" /> Log a Collection</button>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : !ledger ? (
        <div className="empty-state"><Handshake className="w-10 h-10 text-slate-300 mx-auto mb-2" /><p className="text-sm text-slate-400">Nothing to show</p></div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <th className="text-left px-4 py-2.5">Partner</th>
                  <th className="text-right px-4 py-2.5">Collected</th>
                  <th className="text-right px-4 py-2.5">Paid (Expenses)</th>
                  <th className="text-right px-4 py-2.5">Net</th>
                </tr>
              </thead>
              <tbody>
                {ledger.partners.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 font-medium text-slate-800">
                      {p.name}
                      {!p.isLinkedToLogin && <span className="ml-2 text-[10px] text-slate-400 align-middle">(company bucket, not equalized)</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular text-emerald-600">{formatCurrency(p.collected)}</td>
                    <td className="px-4 py-2.5 text-right tabular text-orange-600">{formatCurrency(p.paid)}</td>
                    <td className={cn('px-4 py-2.5 text-right tabular font-semibold', p.net >= 0 ? 'text-emerald-700' : 'text-red-600')}>{formatCurrency(p.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card p-4">
            <h3 className="font-semibold text-slate-800 text-sm mb-1">Settle Up</h3>
            <p className="text-xs text-slate-400 mb-3">Fair share per partner: {formatCurrency(ledger.fairShare)}. Company Account money stays with the company — not part of this.</p>
            {ledger.settlements.length === 0 ? (
              <p className="text-sm text-slate-500">Everyone is already even.</p>
            ) : (
              <div className="space-y-2">
                {ledger.settlements.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-slate-800">{s.fromName}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-medium text-slate-800">{s.toName}</span>
                    <span className="ml-auto font-semibold tabular">{formatCurrency(s.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <PendingCollections />
        </>
      )}

      {open && <LogCollectionModal onClose={() => setOpen(false)} />}
    </div>
  );
}
