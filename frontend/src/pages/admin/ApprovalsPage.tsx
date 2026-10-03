import { useState } from 'react';
import { ShieldCheck, Check, X, ArrowRight } from 'lucide-react';
import { usePendingApprovals, useApproveRequest, useRejectRequest } from '../../hooks/useApprovals';
import { Skeleton } from '../../components/ui/Skeleton';
import { ApprovalRequest } from '../../types/index';
import { formatCurrency, formatDate, formatRelativeTime, cn } from '../../utils/helpers';

const TYPE_LABEL: Record<string, string> = {
  BOOKING_CHANGE: 'Booking Change',
  PAYMENT_CORRECTION: 'Payment Correction',
};

const FIELD_LABEL: Record<string, string> = {
  travelerName: 'Traveler Name', numberOfTravelers: 'Travelers', aadharNumber: 'Aadhar Number',
  foodPreference: 'Food Preference', roomSharing: 'Room Sharing', departureLocation: 'Departure Location',
  departurePackage: 'Departure Package', tourType: 'Tour Type', specialRequest: 'Special Request',
  bookingNotes: 'Booking Notes', finalPrice: 'Final Price', balanceDueDate: 'Balance Due Date',
  status: 'Status', packageId: 'Package', departureDate: 'Departure Date', returnDate: 'Return Date',
  amount: 'Amount', method: 'Payment Method', reference: 'Reference', notes: 'Notes', handoverToId: 'Handover To',
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

export default function ApprovalsPage() {
  const [typeFilter, setTypeFilter] = useState('');
  const { data, isLoading } = usePendingApprovals();
  const requests = data?.data ?? [];
  const filtered = typeFilter ? requests.filter((r) => r.type === typeFilter) : requests;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">Approvals</h2>
        <p className="text-sm text-slate-500 mt-0.5">Everything waiting on your sign-off, in one queue</p>
      </div>

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
