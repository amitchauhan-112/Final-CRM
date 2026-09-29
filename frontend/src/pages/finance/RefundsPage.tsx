import { useState } from 'react';
import { Plus, RotateCcw, Check, IndianRupee, X } from 'lucide-react';
import { useRefunds, useApproveRefund, useMarkRefundPaid, useRejectRefund } from '../../hooks/useFinance';
import RefundFormModal from '../../components/finance/RefundFormModal';
import Modal from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { Refund } from '../../types/index';
import { formatCurrency, formatDate, cn } from '../../utils/helpers';

const STATUS_TABS: { value: string; label: string }[] = [
  { value: 'REQUESTED', label: 'Requested' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'PAID', label: 'Paid' },
  { value: 'REJECTED', label: 'Rejected' },
];

const STATUS_BADGE: Record<string, string> = {
  REQUESTED: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-primary-50 text-primary-700',
  PAID: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-600',
};

function RefundCard({ refund }: { refund: Refund }) {
  const approve = useApproveRefund();
  const markPaid = useMarkRefundPaid();
  const reject = useRejectRefund();
  const [payOpen, setPayOpen] = useState(false);
  const [txnId, setTxnId] = useState('');

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-slate-800 text-sm">{refund.booking?.lead.name}</p>
          <p className="text-xs text-slate-400">{refund.booking?.lead.phone}</p>
        </div>
        <span className={cn('badge', STATUS_BADGE[refund.status])}>{refund.status}</span>
      </div>
      <p className="text-lg font-bold text-slate-800 flex items-center gap-1"><IndianRupee className="w-4 h-4" />{formatCurrency(refund.amount)}</p>
      <p className="text-sm text-slate-600">{refund.reason}</p>
      {refund.remarks && <p className="text-xs text-slate-400">{refund.remarks}</p>}
      <p className="text-xs text-slate-400">Requested by {refund.requestedBy.name} · {formatDate(refund.createdAt)}</p>
      {refund.transactionId && <p className="text-xs text-slate-500">Txn: {refund.transactionId}</p>}

      {refund.status === 'REQUESTED' && (
        <div className="flex items-center gap-2 pt-1">
          <button onClick={() => approve.mutate(refund.id)} disabled={approve.isPending} className="btn-primary text-xs"><Check className="w-3.5 h-3.5" />Approve</button>
          <button onClick={() => reject.mutate({ id: refund.id })} disabled={reject.isPending} className="btn-danger text-xs"><X className="w-3.5 h-3.5" />Reject</button>
        </div>
      )}
      {refund.status === 'APPROVED' && (
        <div className="pt-1">
          <button onClick={() => setPayOpen(true)} className="btn-primary text-xs"><IndianRupee className="w-3.5 h-3.5" />Mark as Paid</button>
        </div>
      )}

      <Modal
        open={payOpen} onClose={() => setPayOpen(false)} title="Mark Refund as Paid" size="sm"
        footer={<>
          <button onClick={() => setPayOpen(false)} className="btn-secondary">Cancel</button>
          <button onClick={() => markPaid.mutate({ id: refund.id, transactionId: txnId }, { onSuccess: () => setPayOpen(false) })} disabled={markPaid.isPending} className="btn-primary">
            {markPaid.isPending ? 'Saving…' : 'Confirm Paid'}
          </button>
        </>}
      >
        <label className="label">Transaction ID</label>
        <input value={txnId} onChange={(e) => setTxnId(e.target.value)} className="input" placeholder="UTR / reference number" />
      </Modal>
    </div>
  );
}

export default function RefundsPage() {
  const [status, setStatus] = useState('REQUESTED');
  const [addOpen, setAddOpen] = useState(false);
  const { data, isLoading } = useRefunds(status);
  const refunds = data?.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="page-title">Refunds</h2>
          <p className="text-sm text-slate-500 mt-0.5">Requested → Approved → Paid workflow</p>
        </div>
        <button onClick={() => setAddOpen(true)} className="btn-primary text-sm"><Plus className="w-4 h-4" />Request Refund</button>
      </div>

      <div className="tabs">
        {STATUS_TABS.map((t) => (
          <button key={t.value} onClick={() => setStatus(t.value)} className={status === t.value ? 'tab-item-active' : 'tab-item'}>{t.label}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
        </div>
      ) : refunds.length === 0 ? (
        <div className="empty-state">
          <RotateCcw className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No {status.toLowerCase()} refunds</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {refunds.map((r) => <RefundCard key={r.id} refund={r} />)}
        </div>
      )}

      <RefundFormModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
