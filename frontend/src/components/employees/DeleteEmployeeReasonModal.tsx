import { useState } from 'react';
import { Archive } from 'lucide-react';
import Modal from '../ui/Modal';
import { cn } from '../../utils/helpers';

const DELETE_REASONS = [
  'Resigned',
  'Terminated',
  'Contract Ended',
  'Role No Longer Needed',
  'Other',
];

interface Props {
  open: boolean;
  employeeName?: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

// Same shape as DeleteLeadReasonModal — a mandatory reason before an Admin
// can delete an employee. Unlike a permanent purge, this is reversible: the
// employee moves to Deleted Employees and can be restored from there.
export default function DeleteEmployeeReasonModal({ open, employeeName, onConfirm, onCancel, isLoading }: Props) {
  const [selected, setSelected] = useState('');
  const [other, setOther] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    if (!selected) { setError('Please select a reason'); return; }
    if (selected === 'Other' && !other.trim()) { setError('Please describe the reason'); return; }
    onConfirm(selected === 'Other' ? other.trim() : selected);
  };

  const handleCancel = () => {
    setSelected('');
    setOther('');
    setError('');
    onCancel();
  };

  return (
    <Modal open={open} onClose={handleCancel} title="Delete Employee" size="sm">
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3.5 bg-red-50 rounded-xl border border-red-100">
          <Archive className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">
            {employeeName ? <><span className="font-semibold">{employeeName}</span> will be </> : 'This employee will be '}
            moved to Deleted Employees. Please select a reason — their name stays intact on any past
            activity, and an admin can restore them anytime.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Reason <span className="text-red-500">*</span></p>
          <div className="grid grid-cols-1 gap-2">
            {DELETE_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => { setSelected(r); setError(''); }}
                className={cn(
                  'text-left px-4 py-2.5 rounded-xl border text-sm font-medium transition-all',
                  selected === r
                    ? 'bg-red-50 border-red-400 text-red-700 ring-1 ring-red-300'
                    : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {selected === 'Other' && (
          <div>
            <label className="label">Describe the reason <span className="text-red-500">*</span></label>
            <textarea
              value={other}
              onChange={(e) => { setOther(e.target.value); setError(''); }}
              rows={2}
              className="input resize-none"
              placeholder="Briefly describe why this employee is being deleted..."
            />
          </div>
        )}

        {error && <p className="text-red-500 text-xs">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={handleCancel} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl text-sm transition-colors disabled:opacity-60"
          >
            {isLoading ? 'Deleting…' : 'Delete Employee'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
