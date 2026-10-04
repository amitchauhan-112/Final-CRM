import { useState } from 'react';
import { XCircle } from 'lucide-react';
import Modal from '../ui/Modal';
import LostReasonPicker, { EMPTY_LOST_SELECTION, LostSelection, lostSelectionError, toLostPayload } from './LostReasonPicker';
import type { LostPayload } from '../../utils/lostReasons';

interface Props {
  open: boolean;
  onConfirm: (payload: LostPayload) => void;
  onCancel: () => void;
}

export default function LostReasonModal({ open, onConfirm, onCancel }: Props) {
  const [selection, setSelection] = useState<LostSelection>(EMPTY_LOST_SELECTION);
  const [error, setError] = useState('');

  const reset = () => {
    setSelection(EMPTY_LOST_SELECTION);
    setError('');
  };

  const handleConfirm = () => {
    const err = lostSelectionError(selection);
    if (err) { setError(err); return; }
    onConfirm(toLostPayload(selection));
    reset();
  };

  const handleCancel = () => {
    reset();
    onCancel();
  };

  return (
    <Modal open={open} onClose={handleCancel} title="Mark as Lost" size="sm">
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3.5 bg-red-50 rounded-xl border border-red-100">
          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">
            Please select a reason for marking this lead as lost. This helps track patterns.
          </p>
        </div>

        <LostReasonPicker
          value={selection}
          onChange={(next) => { setSelection(next); setError(''); }}
        />

        {error && <p className="text-red-500 text-xs">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={handleCancel} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl text-sm transition-colors"
          >
            Mark as Lost
          </button>
        </div>
      </div>
    </Modal>
  );
}
