import { useState } from 'react';
import { ShieldCheck, Check, X, ArrowRight, Plus } from 'lucide-react';
import { usePendingApprovals, useApproveRequest, useRejectRequest, useCreatePaymentRequest } from '../../hooks/useApprovals';
import { Skeleton } from '../../components/ui/Skeleton';
import Modal from '../../components/ui/Modal';
import { ApprovalRequest } from '../../types/index';
import { formatCurrency, formatDate, formatRelativeTime, cn } from '../../utils/helpers';

const TYPE_LABEL: Record<string, string> = {
  BOOKING_CHANGE: 'Booking Change',
  PAYMENT_CORRECTION: 'Payment Correction',
  PAYMENT_REQUEST: 'Payment Request',
};

const FIELD_LABEL: Record<string, string> = {
  travelerName: 'Traveler Name', numberOfTravelers: 'Travelers', aadharNumber: 'Aadhar Number',
  foodPreference: 'Food Preference', roomSharing: 'Room Sharing', departureLocation: 'Departure Location',
  departurePackage: 'Departure Package', tourType: 'Tour Type', specialRequest: 'Special Request',
  bookingNotes: 'Booking Notes', finalPrice: 'Final Price', balanceDueDate: 'Balance Due Date',
  status: 'Status', packageId: 'Package', departureDate: 'Departure Date', returnDate: 'Return Date',
  amount: 'Amount', method: 'Payment Method', reference: 'Reference', notes: 'Notes', handoverToId: 'Handover To',
  payeeName: 'Pay To', reason: 'Reason',
};

const CURRENCY_FIELDS = new Set(['finalPrice', 'amount']);
const DATE_FIELDS = new Set(['balanceDueDate', 'departureDate', 'returnDate']);

function formatFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (CURRENCY_FIELDS.has(key)) return formatCurrency(Number(value));
  if (DATE_FIELDS.has(key)) return formatDate(String(value));
  return String(value);
}

function ApprovalCard({ request }: { request: ApprovalRequest }) {
  const approve = useApproveRequest();
  const reject = useRejectRequest();
  const [reviewNote, setReviewNote] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const fields = Object.keys(request.payload.changes ?? {});

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="badge bg-amber-50 text-amber-700">{TYPE_LABEL[request.type] ?? request.type}</span>
          <p className="text-xs text-slate-400 mt-1">
            Requested by {request.requestedBy.name} · {formatRelativeTime(request.createdAt)}
          </p>
        </div>
      </div>

      {request.note && <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">{request.note}</p>}

      <div className="space-y-1.5">
        {fields.map((field) => (
          <div key={field} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-slate-400 flex-shrink-0">{FIELD_LABEL[field] ?? field}</span>
            <span className="flex items-center gap-1.5 font-medium text-slate-700 text-right">
              <span className="text-slate-400 line-through font-normal">{formatFieldValue(field, request.payload.previous?.[field])}</span>
              <ArrowRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
              <span>{formatFieldValue(field, request.payload.changes[field])}</span>
            </span>
          </div>
        ))}
      </div>

      {rejecting ? (
        <div className="space-y-2 pt-1">
          <textarea
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            placeholder="Reason for rejecting (optional)"
            className="input text-sm"
            rows={2}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => reject.mutate({ id: request.id, reviewNote }, { onSuccess: () => setRejecting(false) })}
              disabled={reject.isPending}
              className="btn-danger text-xs"
            >
              {reject.isPending ? 'Rejecting…' : 'Confirm Reject'}
            </button>
            <button onClick={() => setRejecting(false)} className="btn-secondary text-xs">Cancel</button>
          </div>
        </div>
      ) : request.canResolve === false ? (
        <p className="text-xs text-slate-400 pt-1">Waiting on the sales person who recorded this payment to approve or reject it.</p>
      ) : (
        <div className="flex items-center gap-2 pt-1">
          <button onClick={() => approve.mutate(request.id)} disabled={approve.isPending} className="btn-primary text-xs">
            <Check className="w-3.5 h-3.5" />{approve.isPending ? 'Approving…' : 'Approve'}
          </button>
          <button onClick={() => setRejecting(true)} className="btn-secondary text-xs">
            <X className="w-3.5 h-3.5" />Reject
          </button>
        </div>
      )}
    </div>
  );
}

function PaymentRequestModal({ onClose }: { onClose: () => void }) {
  const [payeeName, setPayeeName] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const create = useCreatePaymentRequest();

  const submit = () => {
    const amt = Number(amount);
    if (!payeeName.trim()) { setError('Who is this payment for?'); return; }
    if (!amt || amt <= 0 || !Number.isInteger(amt)) { setError('Enter a whole rupee amount'); return; }
    if (!reason.trim()) { setError('Add a reason'); return; }
    create.mutate({ payeeName: payeeName.trim(), amount: amt, reason: reason.trim() }, { onSuccess: onClose });
  };

  return (
    <Modal open onClose={onClose} title="Request a Payment" size="sm">
      <div className="space-y-4">
        <p className="text-xs text-slate-500">Sends Finance a request to pay someone. Finance reviews it and records the actual payment themselves.</p>
        <div>
          <label className="label">Pay to <span className="text-red-500">*</span></label>
          <input value={payeeName} onChange={(e) => { setPayeeName(e.target.value); setError(''); }} className="input" placeholder="Vendor / person name" />
        </div>
        <div>
          <label className="label">Amount (₹) <span className="text-red-500">*</span></label>
          <input type="number" min={1} value={amount} onChange={(e) => { setAmount(e.target.value); setError(''); }} className="input" />
        </div>
        <div>
          <label className="label">Reason <span className="text-red-500">*</span></label>
          <textarea value={reason} onChange={(e) => { setReason(e.target.value); setError(''); }} rows={2} className="input resize-none" placeholder="What is this for?" />
        </div>
        {error && <p className="text-red-500 text-xs">{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={submit} disabled={create.isPending} className="btn-primary">{create.isPending ? 'Sending…' : 'Send to Finance'}</button>
        </div>
      </div>
    </Modal>
  );
}

export default function ApprovalsPage() {
  const [typeFilter, setTypeFilter] = useState('');
  const [requestOpen, setRequestOpen] = useState(false);
  const { data, isLoading } = usePendingApprovals();
  const requests = data?.data ?? [];
  const filtered = typeFilter ? requests.filter((r) => r.type === typeFilter) : requests;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="page-title">Approvals</h2>
          <p className="text-sm text-slate-500 mt-0.5">Everything waiting on your sign-off, in one queue</p>
        </div>
        <button onClick={() => setRequestOpen(true)} className="btn-secondary gap-1.5">
          <Plus className="w-4 h-4" /> Request a Payment
        </button>
      </div>

      {requestOpen && <PaymentRequestModal onClose={() => setRequestOpen(false)} />}

      <div className="tabs">
        <button onClick={() => setTypeFilter('')} className={typeFilter === '' ? 'tab-item-active' : 'tab-item'}>All ({requests.length})</button>
        {Object.entries(TYPE_LABEL).map(([value, label]) => (
          <button key={value} onClick={() => setTypeFilter(value)} className={typeFilter === value ? 'tab-item-active' : 'tab-item'}>
            {label} ({requests.filter((r) => r.type === value).length})
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">Nothing pending approval</p>
        </div>
      ) : (
        <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3')}>
          {filtered.map((r) => <ApprovalCard key={r.id} request={r} />)}
        </div>
      )}
    </div>
  );
}
