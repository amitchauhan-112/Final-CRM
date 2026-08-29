import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Target, TrendingUp, Pencil, History } from 'lucide-react';
import { useSalesTargets, useSetSalesTarget, SalesTargetRow } from '../../hooks/useHR';
import { formatCurrency, cn } from '../../utils/helpers';
import { Skeleton } from '../ui/Skeleton';
import Modal from '../ui/Modal';

interface TargetForm { targetRevenue?: number; targetBookings?: number; incentivePercent?: number; }

function TargetFormModal({ row, month, year, onClose }: { row: SalesTargetRow | null; month: number; year: number; onClose: () => void }) {
  const setTarget = useSetSalesTarget();
  const { register, handleSubmit } = useForm<TargetForm>({
    defaultValues: {
      targetRevenue: row?.targetRevenue ?? undefined,
      targetBookings: row?.targetBookings ?? undefined,
      incentivePercent: row?.incentivePercent ?? undefined,
    },
  });

  if (!row) return null;
  return (
    <Modal
      open={!!row} onClose={onClose} title={`Set Target — ${row.user.name}`} size="sm"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button
          form="target-form" type="submit" disabled={setTarget.isPending} className="btn-primary"
        >{setTarget.isPending ? 'Saving…' : 'Save Target'}</button>
      </>}
    >
      <form
        id="target-form"
        onSubmit={handleSubmit((data) => setTarget.mutate({ userId: row.user.id, month, year, ...data }, { onSuccess: onClose }))}
        className="space-y-3"
      >
        <div>
          <label className="label">Revenue Target (₹)</label>
          <input type="number" step="0.01" {...register('targetRevenue')} className="input" />
        </div>
        <div>
          <label className="label">Booking Count Target</label>
          <input type="number" {...register('targetBookings')} className="input" />
        </div>
        <div>
          <label className="label">Incentive % (on revenue above target)</label>
          <input type="number" step="0.01" {...register('incentivePercent')} className="input" placeholder="e.g. 2" />
        </div>
      </form>
    </Modal>
  );
}

function ProgressBar({ achieved, target }: { achieved: number; target: number | null }) {
  if (!target) return null;
  const pct = Math.min(100, Math.round((achieved / target) * 100));
  return (
    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
      <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-emerald-500' : 'bg-primary-500')} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function SalesTargetsTable({ month, year, canEdit, onViewHistory }: {
  month: number; year: number; canEdit: boolean; onViewHistory?: (userId: string) => void;
}) {
  const { data, isLoading } = useSalesTargets(month, year);
  const [editRow, setEditRow] = useState<SalesTargetRow | null>(null);

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>;

  const rows = data ?? [];

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((r) => (
          <div key={r.user.id} className="card p-4 space-y-2">
            <div className="flex items-start justify-between">
              <p className="font-semibold text-slate-800 text-sm">{r.user.name}</p>
              <div className="flex items-center gap-1">
                {onViewHistory && (
                  <button onClick={() => onViewHistory(r.user.id)} className="text-slate-400 hover:text-primary-600" title="View history"><History className="w-3.5 h-3.5" /></button>
                )}
                {canEdit && (
                  <button onClick={() => setEditRow(r)} className="text-slate-400 hover:text-primary-600" title="Set target"><Pencil className="w-3.5 h-3.5" /></button>
                )}
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-500">
                <span className="flex items-center gap-1"><Target className="w-3 h-3" />Revenue</span>
                <span className="font-medium text-slate-700">{formatCurrency(r.achievedRevenue)} {r.targetRevenue ? `/ ${formatCurrency(r.targetRevenue)}` : ''}</span>
              </div>
              <ProgressBar achieved={r.achievedRevenue} target={r.targetRevenue} />

              <div className="flex items-center justify-between text-slate-500 pt-1">
                <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />Bookings</span>
                <span className="font-medium text-slate-700">{r.achievedBookings} {r.targetBookings ? `/ ${r.targetBookings}` : ''}</span>
              </div>
              <ProgressBar achieved={r.achievedBookings} target={r.targetBookings} />
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-400">Incentive ({r.incentivePercent ?? 0}% above target)</span>
              <span className="text-sm font-bold text-emerald-600">{formatCurrency(r.incentiveAmount)}</span>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="col-span-full empty-state">
            <Target className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No sales employees found</p>
          </div>
        )}
      </div>

      {canEdit && <TargetFormModal row={editRow} month={month} year={year} onClose={() => setEditRow(null)} />}
    </>
  );
}
