import { useState } from 'react';
import { Phone, Map, User, IndianRupee, Hash, Image, Check, X, MessageSquareWarning } from 'lucide-react';
import { useApprovePayment, useRejectPayment, useRequestCorrection } from '../../hooks/useFinance';
import { Payment } from '../../types/index';
import Modal from '../ui/Modal';
import { formatCurrency, formatDate, cn } from '../../utils/helpers';

const METHOD_LABEL: Record<string, string> = { CASH: 'Cash', UPI: 'UPI', BANK_TRANSFER: 'Bank Transfer', CHEQUE: 'Cheque', ONLINE: 'Online' };

export default function PaymentVerificationCard({ payment }: { payment: Payment }) {
  const approve = useApprovePayment();
  const reject = useRejectPayment();
  const requestCorrection = useRequestCorrection();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [correctionNote, setCorrectionNote] = useState('');

  const booking = payment.booking;
  const fullProofUrl = payment.proofUrl?.startsWith('/') ? `${window.location.origin}${payment.proofUrl}` : payment.proofUrl;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <p className="font-semibold text-slate-800 text-sm">{booking?.lead?.name ?? booking?.travelerName}</p>
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
    </div>
  );
}
