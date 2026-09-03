import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Search } from 'lucide-react';
import { useAllBookings } from '../../hooks/useErp';
import { useCreateRefund } from '../../hooks/useFinance';
import Modal from '../ui/Modal';
import { formatCurrency, blockDecimalKey, wholeNumberRule } from '../../utils/helpers';

interface RefundForm { amount: number; reason: string; remarks?: string; }

export default function RefundFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const [bookingId, setBookingId] = useState<string | null>(null);
  const { data: bookingsData } = useAllBookings({ search: search || undefined, limit: 8 });
  const bookings = bookingsData?.data ?? [];
  const selected = bookings.find((b) => b.id === bookingId);

  const createRefund = useCreateRefund();
  const { register, handleSubmit, reset } = useForm<RefundForm>();

  const close = () => { onClose(); setBookingId(null); setSearch(''); reset(); };

  const onSubmit = (data: RefundForm) => {
    if (!bookingId) return;
    createRefund.mutate({ bookingId, amount: Number(data.amount), reason: data.reason, remarks: data.remarks }, { onSuccess: close });
  };

  return (
    <Modal
      open={open} onClose={close} title="Request Refund" size="md"
      footer={<>
        <button type="button" onClick={close} className="btn-secondary">Cancel</button>
        <button form="refund-form" type="submit" disabled={createRefund.isPending || !bookingId} className="btn-primary">
          {createRefund.isPending ? 'Submitting…' : 'Submit Refund Request'}
        </button>
      </>}
    >
      {!bookingId ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search booking by customer name or phone..." className="input pl-9" autoFocus />
          </div>
          {search && (
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto">
              {bookings.length === 0 ? (
                <p className="p-3 text-sm text-slate-400">No bookings found</p>
              ) : bookings.map((b) => (
                <button key={b.id} type="button" onClick={() => setBookingId(b.id)} className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 text-left">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{b.lead.name}</p>
                    <p className="text-xs text-slate-400">{b.lead.phone} · Paid {formatCurrency(b.amountPaid)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <form id="refund-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-slate-800">{selected?.lead.name}</p>
              <p className="text-xs text-slate-400">Paid so far: {selected ? formatCurrency(selected.amountPaid) : '—'}</p>
            </div>
            <button type="button" onClick={() => setBookingId(null)} className="text-xs text-primary-600 hover:text-primary-700 font-medium">Change</button>
          </div>
          <div>
            <label className="label">Refund Amount *</label>
            <input type="number" step="1" onKeyDown={blockDecimalKey} {...register('amount', { required: true, min: 1, ...wholeNumberRule })} className="input" placeholder="0" />
          </div>
          <div>
            <label className="label">Refund Reason *</label>
            <textarea {...register('reason', { required: true })} rows={2} className="input" placeholder="Why is this refund being requested?" />
          </div>
          <div>
            <label className="label">Remarks</label>
            <textarea {...register('remarks')} rows={2} className="input" placeholder="Any additional notes..." />
          </div>
        </form>
      )}
    </Modal>
  );
}
