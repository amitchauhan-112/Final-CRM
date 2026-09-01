import { useState } from 'react';
import { Clock } from 'lucide-react';
import Modal from '../ui/Modal';
import DateTimePicker from '../ui/DateTimePicker';

interface Props {
  open: boolean;
  onConfirm: (followUpDate: string, followUpNotes?: string) => void;
  onCancel: () => void;
}

function toLocalDatetimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function FollowUpModal({ open, onConfirm, onCancel }: Props) {
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const nowLocal = toLocalDatetimeInput(new Date());

  const handleConfirm = () => {
    if (!date) { setError('Please pick a follow-up date and time'); return; }
    if (new Date(date) <= new Date()) { setError('Follow-up must be in the future'); return; }
    onConfirm(new Date(date).toISOString(), notes.trim() || undefined);
    setDate('');
    setNotes('');
    setError('');
  };

  const handleCancel = () => {
    setDate('');
    setNotes('');
    setError('');
    onCancel();
  };

  return (
    <Modal open={open} onClose={handleCancel} title="Schedule Follow-up" size="sm">
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3.5 bg-orange-50 rounded-xl border border-orange-100">
          <Clock className="w-5 h-5 text-orange-500 flex-shrink-0" />
          <p className="text-sm text-orange-700">
            Pick when to follow up with this lead. A reminder will show on your dashboard.
          </p>
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
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input"
            placeholder="Reminder note..."
          />
        </div>

        {error && <p className="text-red-500 text-xs">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={handleCancel} className="btn-secondary flex-1">
            Cancel
          </button>
          <button type="button" onClick={handleConfirm} className="btn-primary flex-1">
            Schedule Follow-up
          </button>
        </div>
      </div>
    </Modal>
  );
}
