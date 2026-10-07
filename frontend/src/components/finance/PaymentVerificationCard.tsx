import { useState } from 'react';
import { Phone, Map, User, IndianRupee, Hash, Image, Check, X, MessageSquareWarning, PencilLine } from 'lucide-react';
import { useApprovePayment, useRejectPayment, useRequestCorrection, useProposeCorrection } from '../../hooks/useFinance';
import { usePartnerHandoverOptions } from '../../hooks/usePartnerLedger';
import { Payment } from '../../types/index';
import Modal from '../ui/Modal';
import { formatCurrency, formatDate, cn, blockDecimalKey } from '../../utils/helpers';

const METHOD_LABEL: Record<string, string> = { CASH: 'Cash', UPI: 'UPI', BANK_TRANSFER: 'Bank Transfer', CHEQUE: 'Cheque', ONLINE: 'Online' };

export default function PaymentVerificationCard({ payment }: { payment: Payment }) {
  const approve = useApprovePayment();
  const reject = useRejectPayment();
  const requestCorrection = useRequestCorrection();
  const proposeCorrection = useProposeCorrection();
  const { data: handoverData } = usePartnerHandoverOptions();
  const handoverOptions = handoverData?.data ?? [];
  const [rejectOpen, setRejectOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [proposeOpen, setProposeOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [correctionNote, setCorrectionNote] = useState('');
  const [proposedAmount, setProposedAmount] = useState(String(payment.amount));
  const [proposedMethod, setProposedMethod] = useState(payment.method);
  const [proposedReference, setProposedReference] = useState(payment.reference ?? '');
  const [proposedHandoverToId, setProposedHandoverToId] = useState(payment.handoverToId ?? '');
  const [proposedNote, setProposedNote] = useState('');

  const proposedAmountValid = proposedAmount.trim() !== '' && Number.isInteger(Number(proposedAmount)) && Number(proposedAmount) > 0;
  const proposedHandoverValid = proposedMethod !== 'CASH' || !!proposedHandoverToId;

  const [detailsOpen, setDetailsOpen] = useState(false);
  const booking = payment.booking;
  const fullProofUrl = payment.proofUrl?.startsWith('/') ? `${window.location.origin}${payment.proofUrl}` : payment.proofUrl;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <button onClick={() => setDetailsOpen(true)} className="font-semibold text-slate-800 text-sm hover:text-primary-600 hover:underline text-left">
            {booking?.lead?.name ?? booking?.travelerName}
          </button>
          <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 flex-wrap">
            <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{booking?.lead?.phone}</span>
            {booking?.departure && <span className="flex items-center gap-1"><Map className="w-3 h-3" />{booking.departure.destination}</span>}
            <span className="flex items-center gap-1"><User className="w-3 h-3" />{booking?.lead?.assignedTo?.name ?? '—'}</span>
          </div>
        </div>
        <span className="text-xs text-slate-400">{formatDate(payment.createdAt)}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <p className="text-slate-400">Booking ID</p>
          <p className="font-medium text-slate-700">{booking?.bookingNumber ?? '—'}</p>
        </div>
        <div>
          <p className="text-slate-400">Package Price</p>
          <p className="font-medium text-slate-700">{booking ? formatCurrency(booking.finalPrice) : '—'}</p>
        </div>
        <div>
          <p className="text-slate-400">Amount Received</p>
          <p className="font-semibold text-emerald-600 flex items-center gap-0.5"><IndianRupee className="w-3 h-3" />{formatCurrency(payment.amount)}</p>
        </div>
        <div>
          <p className="text-slate-400">Payment Mode</p>
          <p className="font-medium text-slate-700">{METHOD_LABEL[payment.method] ?? payment.method}</p>
        </div>
        {payment.method === 'CASH' && payment.handoverTo && (
          <div>
            <p className="text-slate-400">Handed To</p>
            <p className="font-medium text-slate-700 flex items-center gap-1"><User className="w-3 h-3" />{payment.handoverTo.name}</p>
          </div>
        )}
        {payment.reference && (
          <div>
            <p className="text-slate-400">Transaction / UTR ID</p>
            <p className="font-medium text-slate-700 flex items-center gap-1"><Hash className="w-3 h-3" />{payment.reference}</p>
          </div>
        )}
        {fullProofUrl && (
          <div>
            <p className="text-slate-400">Proof</p>
            <a href={fullProofUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1">
              <Image className="w-3 h-3" />View screenshot
            </a>
          </div>
        )}
      </div>

      {payment.notes && <p className="text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-lg">{payment.notes}</p>}
      {payment.financeNote && (
        <p className={cn('text-xs px-3 py-2 rounded-lg flex items-start gap-1.5', payment.status === 'REJECTED' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700')}>
          <MessageSquareWarning className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{payment.financeNote}
        </p>
      )}

      {payment.status === 'PENDING' && (
        <div className="flex items-center gap-2 pt-1">
          <button onClick={() => approve.mutate(payment.id)} disabled={approve.isPending} className="btn-primary text-xs">
            <Check className="w-3.5 h-3.5" />Approve Payment
          </button>
          <button onClick={() => setRejectOpen(true)} className="btn-danger text-xs">
            <X className="w-3.5 h-3.5" />Reject Payment
          </button>
          <button onClick={() => setCorrectionOpen(true)} className="btn-secondary text-xs">
            <MessageSquareWarning className="w-3.5 h-3.5" />Request Correction
          </button>
          <button onClick={() => setProposeOpen(true)} className="btn-secondary text-xs">
            <PencilLine className="w-3.5 h-3.5" />Propose Correction
          </button>
        </div>
      )}

      <Modal
        open={rejectOpen} onClose={() => setRejectOpen(false)} title="Reject Payment" size="sm"
        footer={<>
          <button onClick={() => setRejectOpen(false)} className="btn-secondary">Cancel</button>
          <button
            onClick={() => reject.mutate({ id: payment.id, reason: rejectReason }, { onSuccess: () => { setRejectOpen(false); setRejectReason(''); } })}
            disabled={reject.isPending || !rejectReason.trim()} className="btn-danger"
          >
            {reject.isPending ? 'Rejecting…' : 'Reject Payment'}
          </button>
        </>}
      >
        <label className="label">Rejection Reason *</label>
        <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} className="input" placeholder="Explain why this payment is being rejected..." />
      </Modal>

      <Modal
        open={correctionOpen} onClose={() => setCorrectionOpen(false)} title="Request Correction" size="sm"
        footer={<>
          <button onClick={() => setCorrectionOpen(false)} className="btn-secondary">Cancel</button>
          <button
            onClick={() => requestCorrection.mutate({ id: payment.id, note: correctionNote }, { onSuccess: () => { setCorrectionOpen(false); setCorrectionNote(''); } })}
            disabled={requestCorrection.isPending || !correctionNote.trim()} className="btn-primary"
          >
            {requestCorrection.isPending ? 'Sending…' : 'Send to Sales'}
          </button>
        </>}
      >
        <label className="label">What needs correcting? *</label>
        <textarea value={correctionNote} onChange={(e) => setCorrectionNote(e.target.value)} rows={3} className="input" placeholder="e.g. UTR number doesn't match the proof..." />
      </Modal>

      <Modal
        open={proposeOpen} onClose={() => setProposeOpen(false)} title="Propose Correction" size="sm"
        footer={<>
          <button onClick={() => setProposeOpen(false)} className="btn-secondary">Cancel</button>
          <button
            onClick={() => proposeCorrection.mutate(
              {
                id: payment.id, amount: Number(proposedAmount), method: proposedMethod, reference: proposedReference,
                handoverToId: proposedMethod === 'CASH' ? proposedHandoverToId : undefined, note: proposedNote,
              },
              { onSuccess: () => setProposeOpen(false) }
            )}
            disabled={proposeCorrection.isPending || !proposedAmountValid || !proposedHandoverValid} className="btn-primary"
          >
            {proposeCorrection.isPending ? 'Sending…' : 'Send to Sales for Confirmation'}
          </button>
        </>}
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Type the correct values — {payment.recordedBy.name} will see exactly what changed and confirm it with one click, no re-entry needed.
          </p>
          <div>
            <label className="label">Correct Amount (₹)</label>
            <input type="number" min={1} step="1" onKeyDown={blockDecimalKey} value={proposedAmount} onChange={(e) => setProposedAmount(e.target.value)} className="input" />
            {!proposedAmountValid && <p className="text-xs text-red-500 mt-1">Enter a whole number greater than 0</p>}
          </div>
          <div>
            <label className="label">Correct Payment Mode</label>
            <select value={proposedMethod} onChange={(e) => setProposedMethod(e.target.value as Payment['method'])} className="input">
              {Object.entries(METHOD_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          {proposedMethod === 'CASH' && (
            <div>
              <label className="label">Handover To *</label>
              <select value={proposedHandoverToId} onChange={(e) => setProposedHandoverToId(e.target.value)} className="input">
                <option value="">Select…</option>
                {handoverOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">Reference / UTR</label>
            <input value={proposedReference} onChange={(e) => setProposedReference(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">Note (optional)</label>
            <textarea value={proposedNote} onChange={(e) => setProposedNote(e.target.value)} rows={2} className="input" placeholder="Why this correction is needed..." />
          </div>
        </div>
      </Modal>

      <Modal open={detailsOpen} onClose={() => setDetailsOpen(false)} title="Booking Details" size="lg">
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-semibold text-slate-800">{booking?.lead?.name ?? booking?.travelerName}</p>
            <p className="text-xs text-slate-400">{booking?.lead?.phone} · Booking {booking?.bookingNumber ?? '—'}</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div><p className="text-slate-400">Destination</p><p className="font-medium text-slate-700">{booking?.departure?.destination ?? '—'}</p></div>
            <div><p className="text-slate-400">Package</p><p className="font-medium text-slate-700">{booking?.package?.name ?? '—'}</p></div>
            <div><p className="text-slate-400">Tour Type</p><p className="font-medium text-slate-700">{booking?.tourType ?? '—'}</p></div>
            <div><p className="text-slate-400">Departure</p><p className="font-medium text-slate-700">{booking?.departureDate ? formatDate(booking.departureDate) : '—'}</p></div>
            <div><p className="text-slate-400">Return</p><p className="font-medium text-slate-700">{booking?.returnDate ? formatDate(booking.returnDate) : '—'}</p></div>
            <div><p className="text-slate-400">Travelers</p><p className="font-medium text-slate-700">{booking?.numberOfTravelers ?? '—'}</p></div>
            <div><p className="text-slate-400">Booked On</p><p className="font-medium text-slate-700">{booking?.createdAt ? formatDate(booking.createdAt) : '—'}</p></div>
            <div><p className="text-slate-400">Sold For</p><p className="font-medium text-slate-700">{booking ? formatCurrency(booking.finalPrice) : '—'}</p></div>
            <div><p className="text-slate-400">Received So Far</p><p className="font-medium text-emerald-600">{booking ? formatCurrency(booking.amountPaid) : '—'}</p></div>
            <div><p className="text-slate-400">Balance Pending</p><p className="font-semibold text-orange-500">{booking ? formatCurrency(booking.balanceAmount) : '—'}</p></div>
            <div><p className="text-slate-400">Balance Due By</p><p className="font-medium text-slate-700">{booking?.balanceDueDate ? formatDate(booking.balanceDueDate) : '—'}</p></div>
            <div><p className="text-slate-400">Sales Executive</p><p className="font-medium text-slate-700">{booking?.lead?.assignedTo?.name ?? '—'}</p></div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
            <p className="text-slate-400 font-semibold uppercase tracking-wide text-[10px]">This payment</p>
            <p className="font-medium text-slate-700">
              {formatCurrency(payment.amount)} · {METHOD_LABEL[payment.method] ?? payment.method} · {payment.status.replace(/_/g, ' ')}
            </p>
            {payment.reference && <p className="text-slate-500">Ref: {payment.reference}</p>}
          </div>
        </div>
      </Modal>
    </div>
  );
}
