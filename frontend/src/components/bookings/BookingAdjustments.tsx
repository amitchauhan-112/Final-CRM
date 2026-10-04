import { useState } from 'react';
import { Pencil } from 'lucide-react';
import Modal from '../ui/Modal';
import { useAuthStore } from '../../store/authStore';
import { formatCurrency, cn } from '../../utils/helpers';
import { useUpdateBookingAdjustments } from '../../hooks/useBookingAdjustments';

// Only these roles may record a discount or extra expense (matches the server check).
const EDIT_ROLES = ['ADMIN', 'OPERATIONS', 'FINANCE'];

export interface AdjustableBooking {
  id: string;
  finalPrice: number;
  status?: string;
  discountAmount?: number | null;
  discountNote?: string | null;
  extraExpenseAmount?: number | null;
  extraExpenseNote?: string | null;
  departure?: { status?: string } | null;
}

export function isAdjustmentLocked(b: AdjustableBooking): boolean {
  return b.status === 'CANCELLED' || b.departure?.status === 'COMPLETED';
}

export function useCanEditAdjustments(): boolean {
  const role = useAuthStore((s) => s.user?.role);
  return EDIT_ROLES.includes(role ?? '');
}

// Read-only text used in lists: "−₹500" for discount, "+₹1,200" for extra expense.
export function AdjustmentValues({ booking }: { booking: AdjustableBooking }) {
  const discount = booking.discountAmount ?? 0;
  const extra = booking.extraExpenseAmount ?? 0;
  return (
    <div className="text-xs tabular space-y-0.5 text-right">
      <p className={cn(discount > 0 ? 'text-emerald-600' : 'text-slate-400')}>
        Discount {discount > 0 ? `−${formatCurrency(discount)}` : '—'}
      </p>
      <p className={cn(extra > 0 ? 'text-orange-600' : 'text-slate-400')}>
        Extra {extra > 0 ? `+${formatCurrency(extra)}` : '—'}
      </p>
    </div>
  );
}

// Edit button + modal. Renders nothing for roles that can't edit, and a
// disabled note once the trip is completed or the booking is cancelled.
export function AdjustmentEditButton({ booking }: { booking: AdjustableBooking }) {
  const canEdit = useCanEditAdjustments();
  const [open, setOpen] = useState(false);
  if (!canEdit) return null;
  if (isAdjustmentLocked(booking)) {
    return <span className="text-[11px] text-slate-400">Locked</span>;
  }
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
      >
        <Pencil className="w-3 h-3" /> Adjust
      </button>
      {open && <AdjustmentModal booking={booking} onClose={() => setOpen(false)} />}
    </>
  );
}

function AdjustmentModal({ booking, onClose }: { booking: AdjustableBooking; onClose: () => void }) {
  const [discount, setDiscount] = useState(String(booking.discountAmount ?? 0));
  const [discountNote, setDiscountNote] = useState(booking.discountNote ?? '');
  const [extra, setExtra] = useState(String(booking.extraExpenseAmount ?? 0));
  const [extraNote, setExtraNote] = useState(booking.extraExpenseNote ?? '');
  const [error, setError] = useState('');
  const save = useUpdateBookingAdjustments(booking.id);

  const submit = () => {
    const d = Number(discount || 0);
    const x = Number(extra || 0);
    if (!Number.isInteger(d) || d < 0 || !Number.isInteger(x) || x < 0) {
      setError('Enter zero or positive whole rupee amounts'); return;
    }
    if (d > booking.finalPrice) { setError('Discount cannot be more than the booking price'); return; }
    save.mutate(
      { discountAmount: d, discountNote: discountNote.trim(), extraExpenseAmount: x, extraExpenseNote: extraNote.trim() },
      { onSuccess: onClose }
    );
  };

  return (
    <Modal open onClose={onClose} title="Discount & Extra Expense" size="sm">
      <div className="space-y-4">
        <p className="text-xs text-slate-500">Booking price {formatCurrency(booking.finalPrice)}. Locked automatically once the trip is completed.</p>
        <div>
          <label className="label">Discount (₹)</label>
          <input type="number" min={0} value={discount} onChange={(e) => { setDiscount(e.target.value); setError(''); }} className="input" />
          <input value={discountNote} onChange={(e) => setDiscountNote(e.target.value)} className="input mt-2" placeholder="Reason (optional)" />
        </div>
        <div>
          <label className="label">Extra expense (₹)</label>
          <input type="number" min={0} value={extra} onChange={(e) => { setExtra(e.target.value); setError(''); }} className="input" />
          <input value={extraNote} onChange={(e) => setExtraNote(e.target.value)} className="input mt-2" placeholder="What was it for (optional)" />
        </div>
        {error && <p className="text-red-500 text-xs">{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={submit} disabled={save.isPending} className="btn-primary">
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
