import { useState } from 'react';
import { Plus, Receipt, Trash2, Check, X, ExternalLink } from 'lucide-react';
import {
  useExpenses, useCreateExpense, useApproveExpense, useRejectExpense, useDeleteExpense,
} from '../../hooks/useExpenses';
import ExpenseFormModal from '../../components/finance/ExpenseFormModal';
import Modal from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { Expense } from '../../types/index';
import { formatCurrency, formatDate, cn } from '../../utils/helpers';

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-600',
};

const CATEGORY_LABEL: Record<string, string> = {
  HOTEL: 'Hotel', VEHICLE: 'Vehicle', DRIVER: 'Driver', GUIDE: 'Guide', MEALS: 'Meals',
  PERMITS: 'Permits', FUEL: 'Fuel', MISCELLANEOUS: 'Miscellaneous', OFFICE: 'Office',
  MARKETING: 'Marketing', SALARY: 'Salary', SOFTWARE: 'Software', UTILITIES: 'Utilities',
};

function ExpenseCard({ expense }: { expense: Expense }) {
  const approve = useApproveExpense();
  const reject = useRejectExpense();
  const remove = useDeleteExpense();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-slate-800 text-sm">{CATEGORY_LABEL[expense.category] ?? expense.category}</p>
          <p className="text-xs text-slate-400">
            {expense.departure ? expense.departure.destination : 'Company overhead'}
            {expense.package ? ` · ${expense.package.name}` : ''}
            {expense.vendor ? ` · ${expense.vendor.name}` : ''}
          </p>
        </div>
        <span className={cn('badge', STATUS_BADGE[expense.status])}>{expense.status}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div><p className="text-slate-400">Amount</p><p className="font-semibold text-slate-700">{formatCurrency(expense.amount)}</p></div>
        <div><p className="text-slate-400">Logged By</p><p className="font-semibold text-slate-700">{expense.createdBy.name}</p></div>
        <div><p className="text-slate-400">Date</p><p className="font-semibold text-slate-700">{formatDate(expense.createdAt)}</p></div>
        {expense.approvedBy && <div><p className="text-slate-400">{expense.status === 'REJECTED' ? 'Rejected By' : 'Approved By'}</p><p className="font-semibold text-slate-700">{expense.approvedBy.name}</p></div>}
        {expense.paidByPartner && <div><p className="text-slate-400">Paid By</p><p className="font-semibold text-slate-700">{expense.paidByPartner.name}</p></div>}
      </div>
      {expense.description && <p className="text-xs text-slate-500">{expense.description}</p>}
      {expense.rejectionReason && <p className="text-xs text-red-500">Reason: {expense.rejectionReason}</p>}

      <div className="flex items-center gap-1 flex-wrap pt-1">
        {expense.billUrl && (
          <a href={expense.billUrl.startsWith('/') ? `${window.location.origin}${expense.billUrl}` : expense.billUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-slate-500 hover:text-slate-700 flex items-center gap-1">
            <ExternalLink className="w-3 h-3" />Bill
          </a>
        )}
        {expense.status === 'PENDING' && (
          <>
            <button onClick={() => approve.mutate(expense.id)} disabled={approve.isPending} className="text-xs font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1"><Check className="w-3 h-3" />Approve</button>
            <button onClick={() => setRejectOpen(true)} className="text-xs font-medium text-red-500 hover:text-red-600 flex items-center gap-1"><X className="w-3 h-3" />Reject</button>
            <button onClick={() => setDeleteOpen(true)} className="text-xs font-medium text-slate-400 hover:text-slate-600 flex items-center gap-1"><Trash2 className="w-3 h-3" />Remove</button>
          </>
        )}
      </div>

      <Modal
        open={rejectOpen} onClose={() => setRejectOpen(false)} title="Reject Expense" size="sm"
        footer={<>
          <button onClick={() => setRejectOpen(false)} className="btn-secondary">Cancel</button>
          <button
            onClick={() => reject.mutate({ id: expense.id, reason }, { onSuccess: () => { setRejectOpen(false); setReason(''); } })}
            disabled={reject.isPending || !reason.trim()} className="btn-danger"
          >{reject.isPending ? 'Rejecting…' : 'Reject'}</button>
        </>}
      >
        <label className="label">Reason *</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="input" placeholder="Why is this expense being rejected?" />
      </Modal>

      <Modal
        open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Remove Expense" size="sm"
        footer={<>
          <button onClick={() => setDeleteOpen(false)} className="btn-secondary">Cancel</button>
          <button onClick={() => remove.mutate(expense.id, { onSuccess: () => setDeleteOpen(false) })} disabled={remove.isPending} className="btn-danger">{remove.isPending ? 'Removing…' : 'Remove'}</button>
        </>}
      >
        <p className="text-sm text-slate-600">Remove this expense record?</p>
      </Modal>
    </div>
  );
}

export default function ExpensesPage() {
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const { data, isLoading } = useExpenses({ status: status || undefined, category: category || undefined });
  const expenses = data?.data ?? [];
  const createExpense = useCreateExpense();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Expenses</h2>
          <p className="text-sm text-slate-500 mt-0.5">Trip costs and company overhead — approved expenses count toward profitability</p>
        </div>
        <button onClick={() => setAddOpen(true)} className="btn-primary text-sm"><Plus className="w-4 h-4" />Log Expense</button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input py-1.5 text-sm w-auto">
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="input py-1.5 text-sm w-auto">
          <option value="">All Categories</option>
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
        </div>
      ) : expenses.length === 0 ? (
        <div className="empty-state">
          <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No expenses logged yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {expenses.map((e) => <ExpenseCard key={e.id} expense={e} />)}
        </div>
      )}

      <ExpenseFormModal
        open={addOpen} onClose={() => setAddOpen(false)} isLoading={createExpense.isPending}
        onSubmit={(data) => createExpense.mutate(data as any, { onSuccess: () => setAddOpen(false) })}
      />
    </div>
  );
}
