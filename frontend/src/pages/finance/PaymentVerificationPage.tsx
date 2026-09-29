import { useState } from 'react';
import { CheckSquare } from 'lucide-react';
import { usePaymentsForVerification } from '../../hooks/useFinance';
import PaymentVerificationCard from '../../components/finance/PaymentVerificationCard';
import Pagination from '../../components/ui/Pagination';
import { Skeleton } from '../../components/ui/Skeleton';

const STATUSES = [
  { value: 'PENDING', label: 'Pending Verification' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CORRECTION_REQUESTED', label: 'Correction Requested' },
];

const METHODS = [
  { value: '', label: 'All Modes' },
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'ONLINE', label: 'Online' },
];

export default function PaymentVerificationPage() {
  const [status, setStatus] = useState('PENDING');
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('');
  const [page, setPage] = useState(1);

  const handleSearch = (v: string) => { setSearch(v); setPage(1); };
  const handleStatus = (v: string) => { setStatus(v); setPage(1); };
  const handleMethod = (v: string) => { setMethod(v); setPage(1); };

  const { data, isLoading } = usePaymentsForVerification({ status, search: search || undefined, method: method || undefined, page, limit: 20 });
  const payments = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">Payment Verification</h2>
        <p className="text-sm text-slate-500 mt-0.5">Payments recorded by Sales, awaiting your review</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search booking ID, customer, phone..."
          className="input py-1.5 text-sm max-w-xs"
        />
        <select value={status} onChange={(e) => handleStatus(e.target.value)} className="input py-1.5 text-sm w-auto min-w-[170px]">
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={method} onChange={(e) => handleMethod(e.target.value)} className="input py-1.5 text-sm w-auto">
          {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
        </div>
      ) : payments.length === 0 ? (
        <div className="empty-state">
          <CheckSquare className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No payments in this filter</p>
        </div>
      ) : (
        <div className="space-y-3">
          {payments.map((p) => <PaymentVerificationCard key={p.id} payment={p} />)}
        </div>
      )}

      {meta && meta.totalPages > 1 && (
        <Pagination page={page} totalPages={meta.totalPages} onPageChange={setPage} />
      )}
    </div>
  );
}
