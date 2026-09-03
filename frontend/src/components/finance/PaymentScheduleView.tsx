import { useState } from 'react';
import { usePaymentSchedule, useUpdateScheduleItem } from '../../hooks/useFinance';
import PaymentScheduleStepper from './PaymentScheduleStepper';
import Modal from '../ui/Modal';
import { PaymentScheduleItem } from '../../types/index';
import { blockDecimalKey } from '../../utils/helpers';

function EditItemModal({ item, onClose }: { item: PaymentScheduleItem | null; onClose: () => void }) {
  const update = useUpdateScheduleItem();
  const [amount, setAmount] = useState(item?.amount ?? 0);
  const [dueDate, setDueDate] = useState(item?.dueDate?.slice(0, 10) ?? '');

  if (!item) return null;
  return (
    <Modal
      open={!!item} onClose={onClose} title={`Edit ${item.label}`} size="sm"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button
          onClick={() => update.mutate({ id: item.id, amount, dueDate }, { onSuccess: onClose })}
          disabled={update.isPending} className="btn-primary"
        >{update.isPending ? 'Saving…' : 'Save'}</button>
      </>}
    >
      <div className="space-y-3">
        <div>
          <label className="label">Amount</label>
          <input type="number" step="1" onKeyDown={blockDecimalKey} value={amount} onChange={(e) => setAmount(Math.trunc(Number(e.target.value)))} className="input" />
        </div>
        <div>
          <label className="label">Due Date</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" />
        </div>
      </div>
    </Modal>
  );
}

export default function PaymentScheduleView({ bookingId, editable }: { bookingId: string | undefined; editable?: boolean }) {
  const { data, isLoading } = usePaymentSchedule(bookingId);
  const items = data?.data ?? [];
  const [editingItem, setEditingItem] = useState<PaymentScheduleItem | null>(null);

  if (isLoading || items.length === 0) return null;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">Payment Schedule</p>
        <p className="text-xs text-slate-400">
          {items.filter((i) => i.status === 'PAID').length}/{items.length} paid
        </p>
      </div>

      <PaymentScheduleStepper items={items} onEdit={editable ? setEditingItem : undefined} />

      {editable && <EditItemModal item={editingItem} onClose={() => setEditingItem(null)} />}
    </div>
  );
}
