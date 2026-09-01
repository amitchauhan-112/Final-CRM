import { useState } from 'react';
import { Calendar, TrendingUp, CheckCircle, XCircle, ArrowLeft, Clock } from 'lucide-react';
import Modal from '../ui/Modal';
import DateTimePicker from '../ui/DateTimePicker';
import { cn } from '../../utils/helpers';
import type { Lead } from '../../types';

const LOST_REASONS = [
  'Budget Issue',
  'No Response',
  'Booked Elsewhere',
  'Date Not Suitable',
  'Cancelled Trip',
  'Not Interested',
  'Other',
];

function toLocalDatetimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Step = 'choose' | 'reschedule' | 'lost';

interface Props {
  open: boolean;
  lead: Lead | null;
  onClose: () => void;
  onReschedule: (followUpDate: string, followUpNotes?: string) => void;
  onInterested: () => void;
  onConfirmed: () => void;
  onLost: (reason: string, otherText?: string) => void;
}

// Shown whenever a follow-up is marked done — a completed follow-up must
// never be left "hanging" at status Follow-up Scheduled with no next step,
// so this forces one of the four real outcomes before the lead can leave
// the follow-up list, and moves it straight into the matching tab.
export default function FollowUpOutcomeModal({
  open, lead, onClose, onReschedule, onInterested, onConfirmed, onLost,
}: Props) {
  const [step, setStep] = useState<Step>('choose');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [error, setError] = useState('');

  const reset = () => {
    setStep('choose');
    setDate('');
    setNotes('');
    setReason('');
    setOther('');
    setError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleRescheduleSubmit = () => {
    if (!date) { setError('Please pick a follow-up date and time'); return; }
    if (new Date(date) <= new Date()) { setError('Follow-up must be in the future'); return; }
    onReschedule(new Date(date).toISOString(), notes.trim() || undefined);
    reset();
  };

  const handleLostSubmit = () => {
    if (!reason) { setError('Please select a reason'); return; }
    if (reason === 'Other' && !other.trim()) { setError('Please describe the reason'); return; }
    onLost(reason, reason === 'Other' ? other.trim() : undefined);
    reset();
  };

  const nowLocal = toLocalDatetimeInput(new Date());

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={step === 'choose' ? 'Follow-up Complete — What\'s Next?' : step === 'reschedule' ? 'Reschedule Follow-up' : 'Mark as Lost'}
      size="sm"
    >
      {step === 'choose' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            {lead?.name ? `Pick what happens next for ${lead.name}.` : 'Pick what happens next.'} A lead can't
            stay marked as done without moving forward.
          </p>
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => setStep('reschedule')}
              className="flex items-center gap-3 text-left px-4 py-3 rounded-xl border border-slate-200 hover:border-orange-300 hover:bg-orange-50 transition-all"
            >
              <Calendar className="w-4.5 h-4.5 text-orange-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-800">Reschedule</p>
                <p className="text-xs text-slate-500">Pick a new future follow-up date/time</p>
              </div>
            </button>
            <button
              type="button"
              onClick={onInterested}
              className="flex items-center gap-3 text-left px-4 py-3 rounded-xl border border-slate-200 hover:border-violet-300 hover:bg-violet-50 transition-all"
            >
              <TrendingUp className="w-4.5 h-4.5 text-violet-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-800">Interested</p>
                <p className="text-xs text-slate-500">Still interested, no concrete date yet</p>
              </div>
            </button>
            <button
              type="button"
              onClick={onConfirmed}
              className="flex items-center gap-3 text-left px-4 py-3 rounded-xl border border-slate-200 hover:border-green-300 hover:bg-green-50 transition-all"
            >
              <CheckCircle className="w-4.5 h-4.5 text-green-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-800">Confirmed</p>
                <p className="text-xs text-slate-500">Ready to confirm the booking</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setStep('lost')}
              className="flex items-center gap-3 text-left px-4 py-3 rounded-xl border border-slate-200 hover:border-red-300 hover:bg-red-50 transition-all"
            >
              <XCircle className="w-4.5 h-4.5 text-red-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-800">Lost</p>
                <p className="text-xs text-slate-500">Not proceeding — record a reason</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {step === 'reschedule' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3.5 bg-orange-50 rounded-xl border border-orange-100">
            <Clock className="w-5 h-5 text-orange-500 flex-shrink-0" />
            <p className="text-sm text-orange-700">Pick when to follow up next. It'll reappear as a reminder.</p>
          </div>
          <div>
            <label className="label">Follow-up Date & Time <span className="text-red-500">*</span></label>
            <DateTimePicker
              value={date}
              onChange={(v) => { setDate(v); setError(''); }}
              min={nowLocal}
              hasError={!!error}
              autoFocus
            />
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input" placeholder="Reminder note..." />
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => { reset(); setStep('choose'); }} className="btn-secondary flex items-center gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
            <button type="button" onClick={handleRescheduleSubmit} className="btn-primary flex-1">Schedule Follow-up</button>
          </div>
        </div>
      )}

      {step === 'lost' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3.5 bg-red-50 rounded-xl border border-red-100">
            <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">Please select a reason for marking this lead as lost.</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Reason <span className="text-red-500">*</span></p>
            <div className="grid grid-cols-1 gap-2">
              {LOST_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => { setReason(r); setError(''); }}
                  className={cn(
                    'text-left px-4 py-2.5 rounded-xl border text-sm font-medium transition-all',
                    reason === r
                      ? 'bg-red-50 border-red-400 text-red-700 ring-1 ring-red-300'
                      : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          {reason === 'Other' && (
            <div>
              <label className="label">Describe the reason <span className="text-red-500">*</span></label>
              <textarea
                value={other}
                onChange={(e) => { setOther(e.target.value); setError(''); }}
                rows={2}
                className="input resize-none"
                placeholder="Briefly describe why the lead was lost..."
              />
            </div>
          )}
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => { reset(); setStep('choose'); }} className="btn-secondary flex items-center gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
            <button
              type="button"
              onClick={handleLostSubmit}
              className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl text-sm transition-colors"
            >
              Mark as Lost
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
