import { useState } from 'react';
import { IndianRupee, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { usePayouts, useReleasePayout, PayoutLine } from '../../hooks/useHR';
import { formatCurrency, cn, blockDecimalKey } from '../../utils/helpers';
import { Skeleton } from '../ui/Skeleton';
import Modal from '../ui/Modal';

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  PARTIAL: 'bg-blue-50 text-blue-700',
  PAID: 'bg-emerald-50 text-emerald-700',
};
const STATUS_ICON: Record<string, typeof Clock> = { PENDING: Clock, PARTIAL: AlertCircle, PAID: CheckCircle2 };

function PayoutCell({ line, onRelease }: { line: PayoutLine | null; onRelease: (amount: number) => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  if (!line) return <span className="text-xs text-slate-300">—</span>;

  const Icon = STATUS_ICON[line.status];
  const remaining = Math.max(0, line.amountDue - line.amountPaid);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className={cn('badge flex items-center gap-1', STATUS_BADGE[line.status])}><Icon className="w-3 h-3" />{line.status}</span>
      </div>
      <p className="text-xs text-slate-600">Due: {formatCurrency(line.amountDue)}</p>
      <p className="text-xs text-slate-400">Paid: {formatCurrency(line.amountPaid)}</p>
      {remaining > 0 && (
        <button onClick={() => { setAmount(String(remaining)); setOpen(true); }} className="text-xs font-medium text-primary-600 hover:text-primary-700">
          Release Payment
        </button>
      )}
      <Modal
        open={open} onClose={() => setOpen(false)} title="Release Payment" size="sm"
        footer={<>
          <button onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
          <button
            onClick={() => { const n = Number(amount); if (n > 0) { onRelease(n); setOpen(false); } }}
            disabled={!Number(amount) || Number(amount) <= 0}
            className="btn-primary"
          >Release</button>
        </>}
      >
        <div className="space-y-2">
          <p className="text-sm text-slate-600">Amount pending: {formatCurrency(remaining)}</p>
          <div>
            <label className="label">Amount to release (₹)</label>
            <input type="number" step="1" onKeyDown={blockDecimalKey} value={amount} onChange={(e) => setAmount(e.target.value)} className="input" autoFocus />
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function PayrollTable({ month, year }: { month: number; year: number }) {
  const { data, isLoading, isError, error } = usePayouts(month, year);
  const release = useReleasePayout();

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>;

  if (isError) {
    const msg = (error as any)?.response?.data?.error || 'Unable to load payroll data';
    return (
      <div className="empty-state">
        <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-400">{msg}</p>
      </div>
    );
  }

  const rows = data ?? [];

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
          <tr>
            <th className="text-left px-4 py-3">Employee</th>
            <th className="text-left px-4 py-3">Role</th>
            <th className="text-left px-4 py-3">Salary</th>
            <th className="text-left px-4 py-3">Incentive</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.user.id}>
              <td className="px-4 py-3 font-medium text-slate-700">{r.user.name}</td>
              <td className="px-4 py-3 text-xs text-slate-400">{r.user.role}</td>
              <td className="px-4 py-3">
                <PayoutCell line={r.salary} onRelease={(amount) => release.mutate({ userId: r.user.id, type: 'SALARY', month, year, amount })} />
              </td>
              <td className="px-4 py-3">
                <PayoutCell line={r.incentive} onRelease={(amount) => release.mutate({ userId: r.user.id, type: 'INCENTIVE', month, year, amount })} />
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400"><IndianRupee className="w-8 h-8 text-slate-300 mx-auto mb-2" />No employees found</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
